using System.Net;
using System.Net.Http.Json;
using System.Text;
using Erudi.Api.Decks;
using Erudi.Api.Decks.Contracts;
using Erudi.Api.Explore;
using Erudi.Api.Explore.Contracts;
using Erudi.Api.Study;
using Erudi.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Tests.Explore;

/// <summary>
/// The tests of this class share a database, so each one searches for a word of its own
/// (<see cref="NewWord"/>) to see only its decks.
/// </summary>
public sealed class ExploreEndpointsTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    public static TheoryData<string, string> InvalidResults => new()
    {
        { "known", """{"total":4}""" },
        { "total", """{"known":2}""" },
        { "known", """{"known":-1,"total":4}""" },
        { "total", """{"known":0,"total":0}""" },
        { "total", $$"""{"known":1,"total":{{ExploreRules.TestSize + 1}}}""" },
        { "known", """{"known":5,"total":4}""" },
    };

    public static TheoryData<string, string> InvalidReports => new()
    {
        { "reason", """{"details":"Insultes"}""" },
        { "reason", """{"reason":42}""" },
        { "details", $$"""{"reason":"other","details":"{{new string('a', ExploreRules.ReportDetailsMaxLength + 1)}}"}""" },
    };

    [Fact]
    public async Task Search_ListsPublishedDecksWithCards_MostUsedFirst_WithoutTheAuthorsOwnUses()
    {
        var word = NewWord();
        using var author = await factory.SignInNewLearnerAsync();
        using var reader = await factory.SignInNewLearnerAsync();
        using var otherReader = await factory.SignInNewLearnerAsync();
        var code = await PublishedDeckAsync(author.Client, $"Code {word}", DeckCategory.Driving, cards: 2);
        var verbs = await PublishedDeckAsync(author.Client, $"Verbes {word}", DeckCategory.Languages, cards: 1);
        var emptied = await PublishedDeckAsync(author.Client, $"Vide {word}", DeckCategory.Other, cards: 1);
        var draft = await author.Client.CreateDeckAsync($"Brouillon {word}");
        await author.Client.AddCardAsync(draft.Id);
        await DeleteAllCardsAsync(emptied);

        await CopyAsync(reader.Client, verbs);
        await RecordAsync(otherReader.Client, verbs, known: 1, total: 1);
        await RecordAsync(otherReader.Client, verbs, known: 0, total: 1);
        await RecordAsync(author.Client, code, known: 2, total: 2);
        await RecordAsync(author.Client, code, known: 1, total: 2);

        var decks = await SearchAsync(reader.Client, $"?q={word}");

        var authorName = await UsernameAsync(author.Id);
        Assert.Equal(
            [
                new PublicDeckSummaryResponse(verbs, $"Verbes {word}", DeckCategory.Languages, authorName, CardCount: 1, UseCount: 2),
                new PublicDeckSummaryResponse(code, $"Code {word}", DeckCategory.Driving, authorName, CardCount: 2, UseCount: 0),
            ],
            decks);
    }

    [Fact]
    public async Task Search_MatchesTheTitleOrDescriptionWhateverTheCase_WithinACategory()
    {
        var word = NewWord();
        using var author = await factory.SignInNewLearnerAsync();
        var inTitle = await PublishedDeckAsync(author.Client, $"Anglais {word}", DeckCategory.Languages);
        var inDescription = await PublishedDeckAsync(author.Client, "Vocabulaire", DeckCategory.Languages, description: $"Mots {word} du quotidien");
        var otherCategory = await PublishedDeckAsync(author.Client, $"Histoire {word}", DeckCategory.Studies);

        var anyCategory = await SearchAsync(author.Client, $"?q={word.ToUpperInvariant()}");
        var languages = await SearchAsync(author.Client, $"?q={word}&category=languages");
        var studies = await SearchAsync(author.Client, $"?q={word}&category=studies");

        // Equally used decks come by publication date, which these share: compare sorted ids.
        Assert.Equal(new[] { inTitle, inDescription, otherCategory }.Order(), anyCategory.Select(d => d.Id).Order());
        Assert.Equal(new[] { inTitle, inDescription }.Order(), languages.Select(d => d.Id).Order());
        Assert.Equal([otherCategory], studies.Select(d => d.Id));
    }

    [Fact]
    public async Task Search_TreatsWildcardsAsPlainText()
    {
        var word = NewWord();
        using var author = await factory.SignInNewLearnerAsync();
        var percent = await PublishedDeckAsync(author.Client, $"Taux à 5% {word}");
        await PublishedDeckAsync(author.Client, $"Taux à 5 {word}");

        var decks = await SearchAsync(author.Client, $"?q={Uri.EscapeDataString($"5% {word}")}");
        var underscore = await SearchAsync(author.Client, $"?q={Uri.EscapeDataString($"_ {word}")}");

        Assert.Equal([percent], decks.Select(d => d.Id));
        Assert.Empty(underscore);
    }

    [Theory]
    [InlineData("?category=cooking")]
    [InlineData("?category=9")]
    public async Task Search_RejectsAnUnknownCategory(string query)
    {
        using var learner = await factory.SignInNewLearnerAsync();

        using var response = await learner.Client.GetAsync($"/api/explore{query}", Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Search_RejectsATooLongSearch()
    {
        using var learner = await factory.SignInNewLearnerAsync();

        using var response = await learner.Client.GetAsync($"/api/explore?q={new string('a', ExploreRules.SearchMaxLength + 1)}", Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(["q"], (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation))!.Errors.Keys);
    }

    [Fact]
    public async Task Get_ShowsThePublicDeckWithItsFirstCard_ButNotTheAuthorsBoxes()
    {
        using var author = await factory.SignInNewLearnerAsync();
        using var reader = await factory.SignInNewLearnerAsync();
        var deck = await author.Client.CreateDeckAsync("Permis");
        await author.Client.AddCardAsync(deck.Id, "Triangle pointe en bas ?", "Cédez le passage");
        factory.Clock.Advance(TimeSpan.FromSeconds(1));
        await author.Client.AddCardAsync(deck.Id, "Feu orange ?", "S'arrêter");
        var publication = await author.Client.PublishAsync(deck.Id, "Code de la route", DeckCategory.Driving, "Panneaux et priorités");

        using var response = await reader.Client.GetAsync($"/api/explore/{deck.Id}", Cancellation);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var expected = new PublicDeckResponse(
            deck.Id,
            "Code de la route",
            DeckCategory.Driving,
            "Panneaux et priorités",
            await UsernameAsync(author.Id),
            publication.UpdatedAt,
            CardCount: 2,
            UseCount: 0,
            new CardPreviewResponse("Triangle pointe en bas ?", "Cédez le passage"),
            IsMine: false,
            BestScore: null);
        Assert.Equal(expected, await response.Content.ReadFromJsonAsync<PublicDeckResponse>(Cancellation));
        var json = await response.Content.ReadAsStringAsync(Cancellation);
        Assert.DoesNotContain("box", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("dueOn", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(author.Id.ToString(), json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Get_TellsTheAuthorTheDeckIsTheirs()
    {
        using var author = await factory.SignInNewLearnerAsync();
        var deck = await PublishedDeckAsync(author.Client, "Anglais");

        var own = await author.Client.GetFromJsonAsync<PublicDeckResponse>($"/api/explore/{deck}", Cancellation);

        Assert.True(own!.IsMine);
    }

    [Fact]
    public async Task Get_IsDatedByTheLatestChangeToTheCardsOrThePublication()
    {
        using var author = await factory.SignInNewLearnerAsync();
        var deck = await PublishedDeckAsync(author.Client, "Anglais");

        factory.Clock.Advance(TimeSpan.FromDays(2));
        await author.Client.AddCardAsync(deck, "a deadline", "une échéance");
        var afterCard = await author.Client.GetFromJsonAsync<PublicDeckResponse>($"/api/explore/{deck}", Cancellation);
        Assert.Equal(factory.Clock.GetUtcNow(), afterCard!.UpdatedAt);

        factory.Clock.Advance(TimeSpan.FromDays(2));
        await author.Client.PublishAsync(deck, "Anglais B2");
        var afterPublication = await author.Client.GetFromJsonAsync<PublicDeckResponse>($"/api/explore/{deck}", Cancellation);
        Assert.Equal(factory.Clock.GetUtcNow(), afterPublication!.UpdatedAt);
    }

    [Fact]
    public async Task Get_StillShowsAPublishedDeckWithoutCards_WithoutAPreview()
    {
        using var author = await factory.SignInNewLearnerAsync();
        var deck = await PublishedDeckAsync(author.Client, "Anglais");
        await DeleteAllCardsAsync(deck);

        var emptied = await author.Client.GetFromJsonAsync<PublicDeckResponse>($"/api/explore/{deck}", Cancellation);

        Assert.Equal((0, null), (emptied!.CardCount, emptied.Preview));
    }

    [Theory]
    [InlineData("GET", "")]
    [InlineData("GET", "/test")]
    [InlineData("POST", "/results")]
    [InlineData("POST", "/copies")]
    [InlineData("POST", "/reports")]
    public async Task Endpoints_AnswerNotFoundForADeckThatIsNotPublished(string method, string path)
    {
        using var author = await factory.SignInNewLearnerAsync();
        using var reader = await factory.SignInNewLearnerAsync();
        var draft = await author.Client.CreateDeckAsync("Brouillon");
        await author.Client.AddCardAsync(draft.Id);
        var unpublished = await PublishedDeckAsync(author.Client, "Retiré");
        using var unpublish = await author.Client.DeleteAsync($"/api/decks/{unpublished}/publication", Cancellation);
        unpublish.EnsureSuccessStatusCode();

        foreach (var deckId in new[] { draft.Id, unpublished, Guid.NewGuid() })
        {
            using var request = new HttpRequestMessage(new HttpMethod(method), $"/api/explore/{deckId}{path}")
            {
                Content = BodyFor(path),
            };

            using var response = await reader.Client.SendAsync(request, Cancellation);

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }

        Assert.False(await factory.QueryAsync(db => db.Decks.AnyAsync(d => d.OwnerId == reader.Id, Cancellation)));
        Assert.False(await factory.QueryAsync(db => db.DeckUses.AnyAsync(u => u.UserId == reader.Id, Cancellation)));
        Assert.False(await factory.QueryAsync(db => db.DeckReports.AnyAsync(r => r.ReporterId == reader.Id, Cancellation)));
    }

    [Fact]
    public async Task Test_AsksTwentyRandomCardsOfTheDeck_WithItsTitle_AndChangesNothing()
    {
        using var author = await factory.SignInNewLearnerAsync();
        using var reader = await factory.SignInNewLearnerAsync();
        var deck = await PublishedDeckAsync(author.Client, "Capitales", cards: ExploreRules.TestSize + 5);
        var before = await BoxesAsync(deck);

        var cards = await reader.Client.GetFromJsonAsync<TestCardResponse[]>($"/api/explore/{deck}/test", Cancellation) ?? [];

        Assert.Equal(ExploreRules.TestSize, cards.Select(c => c.Id).Distinct().Count());
        Assert.All(cards, card => Assert.Equal("Capitales", card.DeckName));
        var stored = await factory.QueryAsync(db => db.Cards.Where(c => c.DeckId == deck).ToDictionaryAsync(c => c.Id, Cancellation));
        Assert.All(cards, card => Assert.Equal((stored[card.Id].Front, stored[card.Id].Back), (card.Front, card.Back)));
        Assert.Equal(before, await BoxesAsync(deck));
        Assert.False(await factory.QueryAsync(db => db.DeckUses.AnyAsync(u => u.UserId == reader.Id, Cancellation)));
    }

    [Fact]
    public async Task RecordResult_KeepsTheBestScore_AndCountsTheLearnerOnce()
    {
        using var author = await factory.SignInNewLearnerAsync();
        using var reader = await factory.SignInNewLearnerAsync();
        var deck = await PublishedDeckAsync(author.Client, "Capitales", cards: 4);

        Assert.Equal(new TestResultResponse(Score: 75, BestScore: 75), await RecordAsync(reader.Client, deck, known: 3, total: 4));
        Assert.Equal(new TestResultResponse(Score: 25, BestScore: 75), await RecordAsync(reader.Client, deck, known: 1, total: 4));
        Assert.Equal(new TestResultResponse(Score: 100, BestScore: 100), await RecordAsync(reader.Client, deck, known: 4, total: 4));

        var use = await factory.QueryAsync(db => db.DeckUses.AsNoTracking().SingleAsync(u => u.UserId == reader.Id, Cancellation));
        Assert.Equal((deck, 100), (use.DeckId, use.BestScore));
        var sheet = await reader.Client.GetFromJsonAsync<PublicDeckResponse>($"/api/explore/{deck}", Cancellation);
        Assert.Equal((1, 100), (sheet!.UseCount, sheet.BestScore));
    }

    [Theory]
    [InlineData(1, 8, 13)]
    [InlineData(2, 3, 67)]
    [InlineData(0, 3, 0)]
    public async Task RecordResult_RoundsTheScoreToTheNearestPercent(int known, int total, int expected)
    {
        using var author = await factory.SignInNewLearnerAsync();
        using var reader = await factory.SignInNewLearnerAsync();
        var deck = await PublishedDeckAsync(author.Client, "Capitales");

        var result = await RecordAsync(reader.Client, deck, known, total);

        Assert.Equal(expected, result.Score);
    }

    [Theory]
    [MemberData(nameof(InvalidResults))]
    public async Task RecordResult_RejectsAnImpossibleResult(string invalidField, string body)
    {
        using var author = await factory.SignInNewLearnerAsync();
        using var reader = await factory.SignInNewLearnerAsync();
        var deck = await PublishedDeckAsync(author.Client, "Capitales");

        using var response = await reader.Client.PostAsync(
            $"/api/explore/{deck}/results",
            new StringContent(body, Encoding.UTF8, "application/json"),
            Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal([invalidField], (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation))!.Errors.Keys);
        Assert.False(await factory.QueryAsync(db => db.DeckUses.AnyAsync(u => u.UserId == reader.Id, Cancellation)));
    }

    [Fact]
    public async Task Copy_GivesTheLearnerTheirOwnDeck_InTheSameOrder_StartingInBoxOneDueToday()
    {
        using var author = await factory.SignInNewLearnerAsync();
        using var reader = await factory.SignInNewLearnerAsync();
        var deck = await author.Client.CreateDeckAsync("Permis");
        var fronts = new[] { "Triangle pointe en bas ?", "Feu orange ?", "Ligne blanche continue ?" };
        foreach (var front in fronts)
        {
            await author.Client.AddCardAsync(deck.Id, front, "Réponse");
            factory.Clock.Advance(TimeSpan.FromSeconds(1));
        }

        await factory.QueryAsync(db => db.Cards
            .Where(c => c.DeckId == deck.Id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(c => c.Box, 4).SetProperty(c => c.DueOn, factory.Today().AddDays(7)), Cancellation));
        await author.Client.PublishAsync(deck.Id, "Code de la route");

        using var response = await reader.Client.PostAsync($"/api/explore/{deck.Id}/copies", null, Cancellation);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var copy = await response.Content.ReadFromJsonAsync<DeckResponse>(Cancellation);
        Assert.Equal(new DeckResponse(copy!.Id, "Code de la route", CardCount: 3, DueCount: 3, Level: 1, Published: false), copy);
        Assert.EndsWith($"/api/decks/{copy.Id}", response.Headers.Location?.ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.NotEqual(deck.Id, copy.Id);

        var cards = await reader.Client.GetFromJsonAsync<CardSummaryResponse[]>($"/api/decks/{copy.Id}/cards", Cancellation) ?? [];
        Assert.Equal(fronts, cards.Select(c => c.Front));
        var stored = await factory.QueryAsync(db => db.Cards.AsNoTracking().Where(c => c.DeckId == copy.Id).ToListAsync(Cancellation));
        Assert.All(stored, card => Assert.Equal((LeitnerSchedule.FirstBox, factory.Today(), "Réponse"), (card.Box, card.DueOn, card.Back)));
        Assert.Equal(reader.Id, await factory.QueryAsync(db => db.Decks.Where(d => d.Id == copy.Id).Select(d => d.OwnerId).SingleAsync(Cancellation)));

        // The author's deck and progress are untouched.
        Assert.Equal(Enumerable.Repeat(4, 3), (await BoxesAsync(deck.Id)).Values);
        var use = await factory.QueryAsync(db => db.DeckUses.AsNoTracking().SingleAsync(u => u.UserId == reader.Id, Cancellation));
        Assert.Equal((deck.Id, (int?)null), (use.DeckId, use.BestScore));
    }

    [Fact]
    public async Task Copy_ThenTest_CountsTheLearnerOnce()
    {
        using var author = await factory.SignInNewLearnerAsync();
        using var reader = await factory.SignInNewLearnerAsync();
        var deck = await PublishedDeckAsync(author.Client, "Capitales", cards: 2);

        await CopyAsync(reader.Client, deck);
        await CopyAsync(reader.Client, deck);
        var result = await RecordAsync(reader.Client, deck, known: 1, total: 2);

        Assert.Equal(new TestResultResponse(50, 50), result);
        Assert.Equal(2, await factory.QueryAsync(db => db.Decks.CountAsync(d => d.OwnerId == reader.Id, Cancellation)));
        var sheet = await reader.Client.GetFromJsonAsync<PublicDeckResponse>($"/api/explore/{deck}", Cancellation);
        Assert.Equal((1, 50), (sheet!.UseCount, sheet.BestScore));
    }

    [Fact]
    public async Task Copy_RefusesBeyondTheDeckLimit()
    {
        using var author = await factory.SignInNewLearnerAsync();
        using var reader = await factory.SignInNewLearnerAsync();
        var deck = await PublishedDeckAsync(author.Client, "Capitales");
        await factory.QueryAsync(db =>
        {
            db.Decks.AddRange(Enumerable.Range(0, DeckRules.MaxDecksPerUser).Select(i => new Deck
            {
                Id = Guid.CreateVersion7(),
                OwnerId = reader.Id,
                Name = $"Deck {i}",
                CreatedAt = factory.Clock.GetUtcNow(),
                UpdatedAt = factory.Clock.GetUtcNow(),
            }));
            return db.SaveChangesAsync(Cancellation);
        });

        using var response = await reader.Client.PostAsync($"/api/explore/{deck}/copies", null, Cancellation);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Deck limit reached", (await response.Content.ReadFromJsonAsync<ProblemDetails>(Cancellation))!.Title);
        Assert.Equal(DeckRules.MaxDecksPerUser, await factory.QueryAsync(db => db.Decks.CountAsync(d => d.OwnerId == reader.Id, Cancellation)));
        Assert.False(await factory.QueryAsync(db => db.DeckUses.AnyAsync(u => u.UserId == reader.Id, Cancellation)));
    }

    [Fact]
    public async Task Report_KeepsOneReportPerLearner_TheLatestOne()
    {
        using var author = await factory.SignInNewLearnerAsync();
        using var reader = await factory.SignInNewLearnerAsync();
        using var otherReader = await factory.SignInNewLearnerAsync();
        var deck = await PublishedDeckAsync(author.Client, "Capitales");

        using var first = await ReportAsync(reader.Client, deck, new { reason = "offensive", details = "  Insultes  " });
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        var stored = await ReportsAsync(deck);
        Assert.Equal((reader.Id, ReportReason.Offensive, "Insultes", factory.Clock.GetUtcNow()), (stored[0].ReporterId, stored[0].Reason, stored[0].Details, stored[0].ReportedAt));

        factory.Clock.Advance(TimeSpan.FromMinutes(5));
        using var again = await ReportAsync(reader.Client, deck, new { reason = "spam" });
        using var other = await ReportAsync(otherReader.Client, deck, new { reason = "incorrect", details = "La réponse 3 est fausse" });

        Assert.Equal(HttpStatusCode.NoContent, again.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, other.StatusCode);
        var reports = await ReportsAsync(deck);
        Assert.Equal(
            [(otherReader.Id, ReportReason.Incorrect, "La réponse 3 est fausse"), (reader.Id, ReportReason.Spam, "")],
            reports.Select(r => (r.ReporterId, r.Reason, r.Details)).OrderBy(r => r.Reason));
        Assert.True(await factory.QueryAsync(db => db.DeckPublications.AnyAsync(p => p.DeckId == deck, Cancellation)));
    }

    [Theory]
    [MemberData(nameof(InvalidReports))]
    public async Task Report_RejectsAMissingReasonOrTooLongDetails(string invalidField, string body)
    {
        using var author = await factory.SignInNewLearnerAsync();
        using var reader = await factory.SignInNewLearnerAsync();
        var deck = await PublishedDeckAsync(author.Client, "Capitales");

        using var response = await reader.Client.PostAsync(
            $"/api/explore/{deck}/reports",
            new StringContent(body, Encoding.UTF8, "application/json"),
            Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal([invalidField], (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation))!.Errors.Keys);
        Assert.Empty(await ReportsAsync(deck));
    }

    [Theory]
    [InlineData("GET", "/api/explore")]
    [InlineData("GET", "/api/explore/0198f0d6-0000-7000-8000-000000000000")]
    [InlineData("GET", "/api/explore/0198f0d6-0000-7000-8000-000000000000/test")]
    [InlineData("POST", "/api/explore/0198f0d6-0000-7000-8000-000000000000/results")]
    [InlineData("POST", "/api/explore/0198f0d6-0000-7000-8000-000000000000/copies")]
    [InlineData("POST", "/api/explore/0198f0d6-0000-7000-8000-000000000000/reports")]
    public async Task Endpoints_RequireASession(string method, string url)
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), url) { Content = BodyFor(url) };

        using var response = await client.SendAsync(request, Cancellation);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>A word no other test uses, so a search finds this test's decks only.</summary>
    private static string NewWord() => $"w{Guid.NewGuid():N}"[..12];

    private static JsonContent? BodyFor(string path) =>
        path.EndsWith("/results", StringComparison.Ordinal) ? JsonContent.Create(new { known = 1, total = 1 })
        : path.EndsWith("/reports", StringComparison.Ordinal) ? JsonContent.Create(new { reason = "spam" })
        : null;

    private async Task<Guid> PublishedDeckAsync(
        HttpClient author,
        string title,
        DeckCategory category = DeckCategory.Languages,
        int cards = 1,
        string description = "")
    {
        var deck = await author.CreateDeckAsync(title);
        for (var i = 0; i < cards; i++)
        {
            await author.AddCardAsync(deck.Id, $"Front {i}", $"Back {i}");
        }

        await author.PublishAsync(deck.Id, title, category, description);
        return deck.Id;
    }

    private static async Task<PublicDeckSummaryResponse[]> SearchAsync(HttpClient client, string query) =>
        await client.GetFromJsonAsync<PublicDeckSummaryResponse[]>($"/api/explore{query}", Cancellation) ?? [];

    private static async Task<TestResultResponse> RecordAsync(HttpClient client, Guid deckId, int known, int total)
    {
        using var response = await client.PostAsJsonAsync(
            $"/api/explore/{deckId}/results",
            new TestResultRequest { Known = known, Total = total },
            Cancellation);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TestResultResponse>(Cancellation))!;
    }

    private static async Task CopyAsync(HttpClient client, Guid deckId)
    {
        using var response = await client.PostAsync($"/api/explore/{deckId}/copies", null, Cancellation);
        response.EnsureSuccessStatusCode();
    }

    private static Task<HttpResponseMessage> ReportAsync(HttpClient client, Guid deckId, object body) =>
        client.PostAsJsonAsync($"/api/explore/{deckId}/reports", body, Cancellation);

    private Task<int> DeleteAllCardsAsync(Guid deckId) =>
        factory.QueryAsync(db => db.Cards.Where(c => c.DeckId == deckId).ExecuteDeleteAsync(Cancellation));

    private Task<string> UsernameAsync(Guid userId) =>
        factory.QueryAsync(db => db.Users.Where(u => u.Id == userId).Select(u => u.Username).SingleAsync(Cancellation));

    private Task<SortedDictionary<Guid, int>> BoxesAsync(Guid deckId) =>
        factory.QueryAsync(async db => new SortedDictionary<Guid, int>(
            await db.Cards.Where(c => c.DeckId == deckId).ToDictionaryAsync(c => c.Id, c => c.Box, Cancellation)));

    private Task<List<DeckReport>> ReportsAsync(Guid deckId) =>
        factory.QueryAsync(db => db.DeckReports.AsNoTracking().Where(r => r.DeckId == deckId).ToListAsync(Cancellation));
}
