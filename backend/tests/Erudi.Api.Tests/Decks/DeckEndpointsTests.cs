using System.Net;
using System.Net.Http.Json;
using System.Text;
using Erudi.Api.Decks;
using Erudi.Api.Decks.Contracts;
using Erudi.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Tests.Decks;

public sealed class DeckEndpointsTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    public static TheoryData<string> InvalidDecks => new()
    {
        """{}""",
        """{"name":""}""",
        """{"name":"   "}""",
        $$"""{"name":"{{new string('a', DeckRules.NameMaxLength + 1)}}"}""",
    };

    [Fact]
    public async Task Create_StoresTheTrimmedNameForTheSignedInUser()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var client = learner.Client;

        using var response = await client.PostAsJsonAsync("/api/decks", new DeckRequest { Name = "  Anglais  " }, Cancellation);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var deck = await response.Content.ReadFromJsonAsync<DeckResponse>(Cancellation);
        Assert.Equal(new DeckResponse(deck!.Id, "Anglais", CardCount: 0, DueCount: 0, Level: 0), deck);
        Assert.EndsWith($"/api/decks/{deck.Id}", response.Headers.Location?.ToString(), StringComparison.OrdinalIgnoreCase);

        var stored = await factory.QueryAsync(db => db.Decks.SingleAsync(d => d.Id == deck.Id, Cancellation));
        Assert.Equal(learner.Id, stored.OwnerId);
        Assert.Equal("Anglais", stored.Name);
        Assert.Equal(factory.Clock.GetUtcNow(), stored.CreatedAt);
    }

    [Theory]
    [MemberData(nameof(InvalidDecks))]
    public async Task Create_RejectsAMissingBlankOrTooLongName(string body)
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var client = learner.Client;

        using var response = await client.PostAsync("/api/decks", new StringContent(body, Encoding.UTF8, "application/json"), Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation);
        Assert.Equal(["name"], problem!.Errors.Keys);
        Assert.False(await factory.QueryAsync(db => db.Decks.AnyAsync(d => d.OwnerId == learner.Id, Cancellation)));
    }

    [Fact]
    public async Task Create_RefusesBeyondTheDeckLimit()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var client = learner.Client;
        await factory.QueryAsync(db =>
        {
            db.Decks.AddRange(Enumerable.Range(0, DeckRules.MaxDecksPerUser).Select(i => new Deck
            {
                Id = Guid.CreateVersion7(),
                OwnerId = learner.Id,
                Name = $"Deck {i}",
                CreatedAt = factory.Clock.GetUtcNow(),
            }));
            return db.SaveChangesAsync(Cancellation);
        });

        using var response = await client.PostAsJsonAsync("/api/decks", new DeckRequest { Name = "One too many" }, Cancellation);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>(Cancellation);
        Assert.Equal("Deck limit reached", problem!.Title);
        Assert.Equal(DeckRules.MaxDecksPerUser, await factory.QueryAsync(db => db.Decks.CountAsync(d => d.OwnerId == learner.Id, Cancellation)));
    }

    [Fact]
    public async Task List_ReturnsOnlyTheUsersDecksInCreationOrderWithTheirCounts()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        using var strangerLearner = await factory.SignInNewLearnerAsync();
        var client = learner.Client;
        var stranger = strangerLearner.Client;
        var english = await client.CreateDeckAsync("Anglais");
        factory.Clock.Advance(TimeSpan.FromSeconds(1));
        var history = await client.CreateDeckAsync("Histoire");
        await stranger.CreateDeckAsync("Permis");

        await client.AddCardAsync(english.Id, "a deadline", "une échéance");
        var dueLater = await client.AddCardAsync(english.Id, "to look forward to", "avoir hâte de");
        var dueLaterToo = await client.AddCardAsync(english.Id);
        await MoveAsync(dueLater.Id, box: 3, factory.Today().AddDays(1));
        await MoveAsync(dueLaterToo.Id, box: 4, factory.Today().AddDays(3));

        var decks = await client.GetFromJsonAsync<DeckResponse[]>("/api/decks", Cancellation) ?? [];

        // Boxes 1, 3 and 4 average 2.67: the deck shows level 3.
        Assert.Equal(
            [
                new DeckResponse(english.Id, "Anglais", CardCount: 3, DueCount: 1, Level: 3),
                new DeckResponse(history.Id, "Histoire", CardCount: 0, DueCount: 0, Level: 0),
            ],
            decks);
    }

    [Fact]
    public async Task Get_ReturnsTheDeck_ButNotSomeoneElses()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        using var strangerLearner = await factory.SignInNewLearnerAsync();
        var client = learner.Client;
        var stranger = strangerLearner.Client;
        var deck = await client.CreateDeckAsync("Anglais");
        await client.AddCardAsync(deck.Id);

        var own = await client.GetFromJsonAsync<DeckResponse>($"/api/decks/{deck.Id}", Cancellation);
        using var foreign = await stranger.GetAsync($"/api/decks/{deck.Id}", Cancellation);

        Assert.Equal(new DeckResponse(deck.Id, "Anglais", CardCount: 1, DueCount: 1, Level: 1), own);
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
    }

    [Fact]
    public async Task Get_AnswersNotFoundForAnUnknownOrMalformedId()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var client = learner.Client;

        using var unknown = await client.GetAsync($"/api/decks/{Guid.NewGuid()}", Cancellation);
        using var malformed = await client.GetAsync("/api/decks/not-a-guid", Cancellation);

        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, malformed.StatusCode);
    }

    [Fact]
    public async Task Rename_ChangesTheName_ButNotSomeoneElses()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        using var strangerLearner = await factory.SignInNewLearnerAsync();
        var client = learner.Client;
        var stranger = strangerLearner.Client;
        var deck = await client.CreateDeckAsync("Anglai");

        using var foreign = await stranger.PutAsJsonAsync($"/api/decks/{deck.Id}", new DeckRequest { Name = "Hacked" }, Cancellation);
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        Assert.Equal("Anglai", await StoredNameAsync(deck.Id));

        using var own = await client.PutAsJsonAsync($"/api/decks/{deck.Id}", new DeckRequest { Name = " Anglais " }, Cancellation);
        Assert.Equal(HttpStatusCode.OK, own.StatusCode);
        Assert.Equal(deck with { Name = "Anglais" }, await own.Content.ReadFromJsonAsync<DeckResponse>(Cancellation));
        Assert.Equal("Anglais", await StoredNameAsync(deck.Id));
    }

    [Fact]
    public async Task Rename_RejectsABlankName()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var client = learner.Client;
        var deck = await client.CreateDeckAsync("Anglais");

        using var response = await client.PutAsJsonAsync($"/api/decks/{deck.Id}", new DeckRequest { Name = " " }, Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Anglais", await StoredNameAsync(deck.Id));
    }

    [Fact]
    public async Task Delete_RemovesTheDeckAndItsCards_ButNotSomeoneElses()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        using var strangerLearner = await factory.SignInNewLearnerAsync();
        var client = learner.Client;
        var stranger = strangerLearner.Client;
        var deck = await client.CreateDeckAsync();
        var kept = await client.CreateDeckAsync("Histoire");
        await client.AddCardAsync(deck.Id);
        var keptCard = await client.AddCardAsync(kept.Id);

        using var foreign = await stranger.DeleteAsync($"/api/decks/{deck.Id}", Cancellation);
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        Assert.True(await factory.QueryAsync(db => db.Decks.AnyAsync(d => d.Id == deck.Id, Cancellation)));

        using var own = await client.DeleteAsync($"/api/decks/{deck.Id}", Cancellation);
        Assert.Equal(HttpStatusCode.NoContent, own.StatusCode);
        Assert.False(await factory.QueryAsync(db => db.Decks.AnyAsync(d => d.Id == deck.Id, Cancellation)));
        Assert.False(await factory.QueryAsync(db => db.Cards.AnyAsync(c => c.DeckId == deck.Id, Cancellation)));
        Assert.True(await factory.QueryAsync(db => db.Cards.AnyAsync(c => c.Id == keptCard.Id, Cancellation)));

        using var again = await client.DeleteAsync($"/api/decks/{deck.Id}", Cancellation);
        Assert.Equal(HttpStatusCode.NotFound, again.StatusCode);
    }

    [Fact]
    public async Task ListCards_ReturnsTheDecksCardsInCreationOrder_ButNotSomeoneElses()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        using var strangerLearner = await factory.SignInNewLearnerAsync();
        var client = learner.Client;
        var stranger = strangerLearner.Client;
        var deck = await client.CreateDeckAsync();
        var other = await client.CreateDeckAsync("Histoire");
        var first = await client.AddCardAsync(deck.Id, "to run out of");
        factory.Clock.Advance(TimeSpan.FromSeconds(1));
        var second = await client.AddCardAsync(deck.Id, "a deadline");
        await client.AddCardAsync(other.Id, "1830");
        await MoveAsync(second.Id, box: 2, factory.Today().AddDays(2));

        var cards = await client.GetFromJsonAsync<CardSummaryResponse[]>($"/api/decks/{deck.Id}/cards", Cancellation) ?? [];
        using var foreign = await stranger.GetAsync($"/api/decks/{deck.Id}/cards", Cancellation);

        Assert.Equal([new CardSummaryResponse(first.Id, "to run out of", 1), new CardSummaryResponse(second.Id, "a deadline", 2)], cards);
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
    }

    [Theory]
    [InlineData("GET", "/api/decks")]
    [InlineData("POST", "/api/decks")]
    [InlineData("GET", "/api/decks/0198f0d6-0000-7000-8000-000000000000/cards")]
    [InlineData("DELETE", "/api/decks/0198f0d6-0000-7000-8000-000000000000")]
    public async Task Endpoints_RequireASession(string method, string url)
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), url) { Content = JsonContent.Create(new DeckRequest { Name = "Anglais" }) };

        using var response = await client.SendAsync(request, Cancellation);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private Task<int> MoveAsync(Guid cardId, int box, DateOnly dueOn) =>
        factory.QueryAsync(db => db.Cards
            .Where(c => c.Id == cardId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(c => c.Box, box).SetProperty(c => c.DueOn, dueOn), Cancellation));

    private Task<string> StoredNameAsync(Guid deckId) =>
        factory.QueryAsync(db => db.Decks.Where(d => d.Id == deckId).Select(d => d.Name).SingleAsync(Cancellation));
}
