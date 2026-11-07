using System.Net;
using System.Net.Http.Json;
using System.Text;
using Erudi.Api.Data;
using Erudi.Api.Decks;
using Erudi.Api.Decks.Contracts;
using Erudi.Api.Study;
using Erudi.Api.Study.Contracts;
using Erudi.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Erudi.Api.Tests.Study;

public sealed class StudyEndpointsTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    public static TheoryData<int, int, int> KnownMoves => new()
    {
        { 1, 2, 2 },
        { 2, 3, 4 },
        { 4, 5, 14 },
        { 5, 5, 14 },
    };

    [Fact]
    public async Task Quiz_AsksTheDueCardsOfEveryDeck_LeastKnownAndMostOverdueFirst()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var english = await learner.Client.CreateDeckAsync("Anglais");
        var history = await learner.Client.CreateDeckAsync("Histoire");
        var newCard = await learner.Client.AddCardAsync(english.Id, "a deadline", "une échéance");
        var overdueBox3 = await learner.Client.AddCardAsync(english.Id, "to run out of", "manquer de");
        var notDue = await learner.Client.AddCardAsync(english.Id, "to look forward to", "avoir hâte de");
        var overdueBox1 = await learner.Client.AddCardAsync(history.Id, "1830", "Indépendance de la Belgique");
        await MoveAsync(overdueBox3.Id, box: 3, factory.Today().AddDays(-2));
        await MoveAsync(notDue.Id, box: 2, factory.Today().AddDays(1));
        await MoveAsync(overdueBox1.Id, box: 1, factory.Today().AddDays(-1));
        await stranger.Client.AddCardAsync((await stranger.Client.CreateDeckAsync()).Id);

        var cards = await learner.Client.GetFromJsonAsync<StudyCardResponse[]>("/api/study/quiz", Cancellation) ?? [];

        Assert.Equal(
            [
                new StudyCardResponse(overdueBox1.Id, history.Id, "Histoire", "1830", "Indépendance de la Belgique", 1),
                new StudyCardResponse(newCard.Id, english.Id, "Anglais", "a deadline", "une échéance", 1),
                new StudyCardResponse(overdueBox3.Id, english.Id, "Anglais", "to run out of", "manquer de", 3),
            ],
            cards);
    }

    [Fact]
    public async Task Quiz_CanBeLimitedToOneOfTheLearnersDecks()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var english = await learner.Client.CreateDeckAsync("Anglais");
        var history = await learner.Client.CreateDeckAsync("Histoire");
        var englishCard = await learner.Client.AddCardAsync(english.Id);
        await learner.Client.AddCardAsync(history.Id, "1830", "Indépendance");

        var cards = await learner.Client.GetFromJsonAsync<StudyCardResponse[]>($"/api/study/quiz?deckId={english.Id}", Cancellation) ?? [];
        using var foreign = await stranger.Client.GetAsync($"/api/study/quiz?deckId={english.Id}", Cancellation);
        using var malformed = await learner.Client.GetAsync("/api/study/quiz?deckId=not-a-guid", Cancellation);

        Assert.Equal([englishCard.Id], cards.Select(c => c.Id));
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, malformed.StatusCode);
    }

    [Fact]
    public async Task Quiz_AsksAtMostFiftyCards()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        await SeedCardsAsync(deck.Id, StudyService.QuizSize + 10);

        var cards = await learner.Client.GetFromJsonAsync<StudyCardResponse[]>("/api/study/quiz", Cancellation) ?? [];

        Assert.Equal(StudyService.QuizSize, cards.Length);
    }

    [Theory]
    [MemberData(nameof(KnownMoves))]
    public async Task Answer_KnownCardMovesUpABox_AndComesBackAfterItsInterval(int box, int expectedBox, int expectedDays)
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        var card = await learner.Client.AddCardAsync(deck.Id);
        await MoveAsync(card.Id, box, factory.Today());

        using var response = await AnswerAsync(learner.Client, card.Id, knew: true);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var expected = new AnswerResponse(expectedBox, factory.Today().AddDays(expectedDays));
        Assert.Equal(expected, await response.Content.ReadFromJsonAsync<AnswerResponse>(Cancellation));
        var stored = await StoredCardAsync(card.Id);
        Assert.Equal((expected.Box, expected.DueOn), (stored.Box, stored.DueOn));

        var review = Assert.Single(await ReviewsAsync(learner.Id));
        Assert.Equal(
            (card.Id, factory.Today(), true, box, expectedBox, factory.Clock.GetUtcNow()),
            (review.CardId, review.StudyDay, review.Knew, review.FromBox, review.ToBox, review.ReviewedAt));
    }

    [Fact]
    public async Task Answer_ForgottenCardGoesBackToBoxOne_AndComesBackTomorrow()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        var card = await learner.Client.AddCardAsync(deck.Id);
        await MoveAsync(card.Id, box: 4, factory.Today().AddDays(-3));

        using var response = await AnswerAsync(learner.Client, card.Id, knew: false);

        Assert.Equal(new AnswerResponse(1, factory.Today().AddDays(1)), await response.Content.ReadFromJsonAsync<AnswerResponse>(Cancellation));
        var review = Assert.Single(await ReviewsAsync(learner.Id));
        Assert.Equal((false, 4, 1), (review.Knew, review.FromBox, review.ToBox));
    }

    [Fact]
    public async Task Answer_RefusesACardThatIsNotDue_AndRecordsNothing()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        var card = await learner.Client.AddCardAsync(deck.Id);
        var dueOn = factory.Today().AddDays(1);
        await MoveAsync(card.Id, box: 2, dueOn);

        using var response = await AnswerAsync(learner.Client, card.Id, knew: true);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Card not due", (await response.Content.ReadFromJsonAsync<ProblemDetails>(Cancellation))!.Title);
        var stored = await StoredCardAsync(card.Id);
        Assert.Equal((2, dueOn), (stored.Box, stored.DueOn));
        Assert.Empty(await ReviewsAsync(learner.Id));
    }

    [Fact]
    public async Task Answer_TwiceInARow_MovesTheCardOnlyOnce()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        var card = await learner.Client.AddCardAsync(deck.Id);

        using var first = await AnswerAsync(learner.Client, card.Id, knew: true);
        using var second = await AnswerAsync(learner.Client, card.Id, knew: true);

        Assert.Equal((HttpStatusCode.OK, HttpStatusCode.Conflict), (first.StatusCode, second.StatusCode));
        Assert.Equal(2, (await StoredCardAsync(card.Id)).Box);
        Assert.Single(await ReviewsAsync(learner.Id));
    }

    [Fact]
    public async Task Answer_WhileAnotherTabAnswersTheSameCard_MovesItOnlyOnce()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        var card = await learner.Client.AddCardAsync(deck.Id);
        var otherTabDueOn = factory.Today().AddDays(2);

        // The other tab's answer is half-way: the card is moved but not committed yet, so
        // this request still reads it in box 1, due today, and then waits for the row lock.
        await using var scope = factory.Services.CreateAsyncScope();
        var otherTab = scope.ServiceProvider.GetRequiredService<ErudiDbContext>();
        await using var transaction = await otherTab.Database.BeginTransactionAsync(Cancellation);
        await otherTab.Cards
            .Where(c => c.Id == card.Id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(c => c.Box, 2).SetProperty(c => c.DueOn, otherTabDueOn), Cancellation);

        var answering = AnswerAsync(learner.Client, card.Id, knew: true);
        await WaitUntilAQueryWaitsForALockAsync();
        await transaction.CommitAsync(Cancellation);
        using var response = await answering;

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var stored = await StoredCardAsync(card.Id);
        Assert.Equal((2, otherTabDueOn), (stored.Box, stored.DueOn));
        Assert.Empty(await ReviewsAsync(learner.Id));
    }

    [Fact]
    public async Task Answer_LeavesSomeoneElsesCardUntouched()
    {
        using var owner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var deck = await owner.Client.CreateDeckAsync();
        var card = await owner.Client.AddCardAsync(deck.Id);

        using var response = await AnswerAsync(stranger.Client, card.Id, knew: true);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, (await StoredCardAsync(card.Id)).Box);
        Assert.Empty(await ReviewsAsync(stranger.Id));
        Assert.Empty(await ReviewsAsync(owner.Id));
    }

    [Theory]
    [InlineData("knew", """{"cardId":"0198f0d6-0000-7000-8000-000000000000"}""")]
    [InlineData("knew", """{"cardId":"0198f0d6-0000-7000-8000-000000000000","knew":null}""")]
    [InlineData("cardId", """{"knew":true}""")]
    public async Task Answer_RequiresTheCardAndTheAnswer(string missingField, string body)
    {
        using var learner = await factory.SignInNewLearnerAsync();

        using var response = await learner.Client.PostAsync(
            "/api/study/answers",
            new StringContent(body, Encoding.UTF8, "application/json"),
            Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation);
        Assert.Equal([missingField], problem!.Errors.Keys);
    }

    [Fact]
    public async Task Practice_AsksRandomCardsOfEveryDeck_WithoutMovingThem()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var english = await learner.Client.CreateDeckAsync("Anglais");
        var history = await learner.Client.CreateDeckAsync("Histoire");
        await SeedCardsAsync(english.Id, 15, dueOn: factory.Today().AddDays(5));
        await SeedCardsAsync(history.Id, 15);
        await stranger.Client.AddCardAsync((await stranger.Client.CreateDeckAsync()).Id);
        var before = await BoxesAsync(learner.Id);

        var cards = await learner.Client.GetFromJsonAsync<StudyCardResponse[]>("/api/study/practice", Cancellation) ?? [];

        Assert.Equal(StudyService.PracticeSize, cards.Length);
        Assert.Equal(cards.Length, cards.Select(c => c.Id).Distinct().Count());
        Assert.All(cards, c => Assert.Contains(c.DeckId, new[] { english.Id, history.Id }));
        Assert.Equal(before, await BoxesAsync(learner.Id));
        Assert.Empty(await ReviewsAsync(learner.Id));
    }

    [Fact]
    public async Task Practice_CanBeLimitedToOneDeck_IncludingCardsThatAreNotDue()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var english = await learner.Client.CreateDeckAsync("Anglais");
        var history = await learner.Client.CreateDeckAsync("Histoire");
        var due = await learner.Client.AddCardAsync(english.Id, "a deadline");
        var notDue = await learner.Client.AddCardAsync(english.Id, "to run out of");
        await learner.Client.AddCardAsync(history.Id, "1830");
        await MoveAsync(notDue.Id, box: 5, factory.Today().AddDays(10));

        var cards = await learner.Client.GetFromJsonAsync<StudyCardResponse[]>($"/api/study/practice?deckId={english.Id}", Cancellation) ?? [];
        using var foreign = await stranger.Client.GetAsync($"/api/study/practice?deckId={english.Id}", Cancellation);

        Assert.Equal(new[] { due.Id, notDue.Id }.Order(), cards.Select(c => c.Id).Order());
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
    }

    [Fact]
    public async Task Summary_CountsTodaysAnswersTheDueCardsAndEachBox()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        var answered = await learner.Client.AddCardAsync(deck.Id, "a deadline");
        await learner.Client.AddCardAsync(deck.Id, "to run out of");
        var later = await learner.Client.AddCardAsync(deck.Id, "to look forward to");
        await MoveAsync(later.Id, box: 4, factory.Today().AddDays(3));
        (await AnswerAsync(learner.Client, answered.Id, knew: true)).Dispose();
        var strangerDeck = await stranger.Client.CreateDeckAsync();
        (await AnswerAsync(stranger.Client, (await stranger.Client.AddCardAsync(strangerDeck.Id)).Id, knew: false)).Dispose();

        var summary = await learner.Client.GetFromJsonAsync<StudySummaryResponse>("/api/study/summary", Cancellation);

        Assert.Equal(1, summary!.ReviewedToday);
        Assert.Equal(1, summary.DueCount);
        Assert.Equal([1, 1, 0, 1, 0], summary.Boxes);
    }

    [Fact]
    public async Task Summary_StartsANewDayWithNoAnswers()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        var card = await learner.Client.AddCardAsync(deck.Id);
        (await AnswerAsync(learner.Client, card.Id, knew: false)).Dispose();

        factory.Clock.Advance(TimeSpan.FromDays(1));
        var summary = await learner.Client.GetFromJsonAsync<StudySummaryResponse>("/api/study/summary", Cancellation);

        Assert.Equal((0, 1), (summary!.ReviewedToday, summary.DueCount));
        Assert.Single(await ReviewsAsync(learner.Id));
    }

    [Fact]
    public async Task DeletingACard_KeepsItsAnswersInTheDaysCount()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        var card = await learner.Client.AddCardAsync(deck.Id);
        (await AnswerAsync(learner.Client, card.Id, knew: true)).Dispose();

        (await learner.Client.DeleteAsync($"/api/decks/{deck.Id}", Cancellation)).Dispose();
        var summary = await learner.Client.GetFromJsonAsync<StudySummaryResponse>("/api/study/summary", Cancellation);

        Assert.Equal((1, 0), (summary!.ReviewedToday, summary.DueCount));
        Assert.Null(Assert.Single(await ReviewsAsync(learner.Id)).CardId);
    }

    [Theory]
    [InlineData("GET", "/api/study/summary")]
    [InlineData("GET", "/api/study/quiz")]
    [InlineData("GET", "/api/study/practice")]
    [InlineData("POST", "/api/study/answers")]
    public async Task Endpoints_RequireASession(string method, string url)
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), url)
        {
            Content = JsonContent.Create(new AnswerRequest { CardId = Guid.NewGuid(), Knew = true }),
        };

        using var response = await client.SendAsync(request, Cancellation);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private static Task<HttpResponseMessage> AnswerAsync(HttpClient client, Guid cardId, bool knew) =>
        client.PostAsJsonAsync("/api/study/answers", new AnswerRequest { CardId = cardId, Knew = knew }, Cancellation);

    private async Task WaitUntilAQueryWaitsForALockAsync()
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            var waiting = await factory.QueryAsync(db => db.Database
                .SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'")
                .SingleAsync(Cancellation));
            if (waiting > 0)
            {
                return;
            }

            await Task.Delay(50, Cancellation);
        }

        Assert.Fail("The answer never waited for the other tab's lock.");
    }

    private Task<int> MoveAsync(Guid cardId, int box, DateOnly dueOn) =>
        factory.QueryAsync(db => db.Cards
            .Where(c => c.Id == cardId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(c => c.Box, box).SetProperty(c => c.DueOn, dueOn), Cancellation));

    private Task<int> SeedCardsAsync(Guid deckId, int count, DateOnly? dueOn = null) =>
        factory.QueryAsync(db =>
        {
            db.Cards.AddRange(Enumerable.Range(0, count).Select(i => new Card
            {
                Id = Guid.CreateVersion7(),
                DeckId = deckId,
                Front = $"Front {i}",
                Back = $"Back {i}",
                Box = i % LeitnerSchedule.LastBox + 1,
                DueOn = dueOn ?? factory.Today(),
                CreatedAt = factory.Clock.GetUtcNow(),
            }));
            return db.SaveChangesAsync(Cancellation);
        });

    private Task<Card> StoredCardAsync(Guid cardId) =>
        factory.QueryAsync(db => db.Cards.AsNoTracking().SingleAsync(c => c.Id == cardId, Cancellation));

    private Task<List<CardReview>> ReviewsAsync(Guid userId) =>
        factory.QueryAsync(db => db.CardReviews.AsNoTracking().Where(r => r.UserId == userId).ToListAsync(Cancellation));

    private Task<List<(Guid, int, DateOnly)>> BoxesAsync(Guid userId) =>
        factory.QueryAsync(async db => (await db.Cards
                .Where(c => c.Deck.OwnerId == userId)
                .OrderBy(c => c.Id)
                .Select(c => new { c.Id, c.Box, c.DueOn })
                .ToListAsync(Cancellation))
            .Select(c => (c.Id, c.Box, c.DueOn))
            .ToList());
}
