using System.Net;
using System.Net.Http.Json;
using System.Text;
using Erudi.Api.Decks;
using Erudi.Api.Decks.Contracts;
using Erudi.Api.Study;
using Erudi.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Tests.Decks;

public sealed class CardEndpointsTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    public static TheoryData<string, string> InvalidCards => new()
    {
        { "front", """{"back":"manquer de"}""" },
        { "front", """{"front":"  ","back":"manquer de"}""" },
        { "back", """{"front":"to run out of","back":""}""" },
        { "back", $$"""{"front":"to run out of","back":"{{new string('a', DeckRules.CardSideMaxLength + 1)}}"}""" },
    };

    [Fact]
    public async Task Add_StartsTheTrimmedCardInBoxOneDueToday()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();

        using var response = await learner.Client.PostAsJsonAsync(
            $"/api/decks/{deck.Id}/cards",
            new CardRequest { Front = " to run out of\n", Back = "  manquer de " },
            Cancellation);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var card = await response.Content.ReadFromJsonAsync<CardResponse>(Cancellation);
        Assert.Equal(new CardResponse(card!.Id, deck.Id, "to run out of", "manquer de", Box: 1), card);
        Assert.EndsWith($"/api/cards/{card.Id}", response.Headers.Location?.ToString(), StringComparison.OrdinalIgnoreCase);

        var stored = await StoredCardAsync(card.Id);
        Assert.Equal(LeitnerSchedule.FirstBox, stored.Box);
        Assert.Equal(factory.Today(), stored.DueOn);
        Assert.Equal(factory.Clock.GetUtcNow(), stored.CreatedAt);
    }

    [Fact]
    public async Task Add_IsDueOnTheLearnersDayInTheirTimeZone()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        // At noon UTC it is already tomorrow in Kiritimati (UTC+14).
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/decks/{deck.Id}/cards")
        {
            Content = JsonContent.Create(new CardRequest { Front = "a deadline", Back = "une échéance" }),
        };
        request.Headers.Add(StudyCalendar.TimeZoneHeader, "Pacific/Kiritimati");

        using var response = await learner.Client.SendAsync(request, Cancellation);

        var card = await response.Content.ReadFromJsonAsync<CardResponse>(Cancellation);
        var expected = DateOnly.FromDateTime(factory.Clock.GetUtcNow().UtcDateTime.AddHours(14));
        Assert.Equal(expected, (await StoredCardAsync(card!.Id)).DueOn);
        Assert.NotEqual(factory.Today(), expected);
    }

    [Theory]
    [MemberData(nameof(InvalidCards))]
    public async Task Add_RejectsAMissingBlankOrTooLongSide(string invalidField, string body)
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();

        using var response = await learner.Client.PostAsync(
            $"/api/decks/{deck.Id}/cards",
            new StringContent(body, Encoding.UTF8, "application/json"),
            Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation);
        Assert.Equal([invalidField], problem!.Errors.Keys);
        Assert.Equal(0, await CardCountAsync(deck.Id));
    }

    [Fact]
    public async Task Add_AnswersNotFoundForSomeoneElsesDeck()
    {
        using var owner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var deck = await owner.Client.CreateDeckAsync();

        using var response = await stranger.Client.PostAsJsonAsync(
            $"/api/decks/{deck.Id}/cards",
            new CardRequest { Front = "spam", Back = "spam" },
            Cancellation);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(0, await CardCountAsync(deck.Id));
    }

    [Fact]
    public async Task Add_RefusesBeyondTheCardLimit()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        await factory.QueryAsync(db =>
        {
            db.Cards.AddRange(Enumerable.Range(0, DeckRules.MaxCardsPerDeck).Select(i => new Card
            {
                Id = Guid.CreateVersion7(),
                DeckId = deck.Id,
                Front = $"Front {i}",
                Back = $"Back {i}",
                DueOn = factory.Today(),
                CreatedAt = factory.Clock.GetUtcNow(),
            }));
            return db.SaveChangesAsync(Cancellation);
        });

        using var response = await learner.Client.PostAsJsonAsync(
            $"/api/decks/{deck.Id}/cards",
            new CardRequest { Front = "One too many", Back = "Une de trop" },
            Cancellation);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>(Cancellation);
        Assert.Equal("Card limit reached", problem!.Title);
        Assert.Equal(DeckRules.MaxCardsPerDeck, await CardCountAsync(deck.Id));
    }

    [Fact]
    public async Task Get_ReturnsBothSides_ButNotSomeoneElsesCard()
    {
        using var owner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var deck = await owner.Client.CreateDeckAsync();
        var card = await owner.Client.AddCardAsync(deck.Id, "to run out of", "manquer de");

        var own = await owner.Client.GetFromJsonAsync<CardResponse>($"/api/cards/{card.Id}", Cancellation);
        using var foreign = await stranger.Client.GetAsync($"/api/cards/{card.Id}", Cancellation);

        Assert.Equal(new CardResponse(card.Id, deck.Id, "to run out of", "manquer de", Box: 1), own);
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
    }

    [Fact]
    public async Task Update_ChangesTheTextButKeepsTheBoxAndDueDay()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        var card = await learner.Client.AddCardAsync(deck.Id, "to run ot of", "manquer de");
        var dueOn = factory.Today().AddDays(4);
        await factory.QueryAsync(db => db.Cards
            .Where(c => c.Id == card.Id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(c => c.Box, 3).SetProperty(c => c.DueOn, dueOn), Cancellation));

        using var response = await learner.Client.PutAsJsonAsync(
            $"/api/cards/{card.Id}",
            new CardRequest { Front = " to run out of ", Back = "être à court de" },
            Cancellation);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(
            new CardResponse(card.Id, deck.Id, "to run out of", "être à court de", Box: 3),
            await response.Content.ReadFromJsonAsync<CardResponse>(Cancellation));
        var stored = await StoredCardAsync(card.Id);
        Assert.Equal(("to run out of", "être à court de", 3, dueOn), (stored.Front, stored.Back, stored.Box, stored.DueOn));
    }

    [Fact]
    public async Task Update_LeavesSomeoneElsesCardAndInvalidTextUntouched()
    {
        using var owner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var deck = await owner.Client.CreateDeckAsync();
        var card = await owner.Client.AddCardAsync(deck.Id, "to run out of", "manquer de");

        using var foreign = await stranger.Client.PutAsJsonAsync(
            $"/api/cards/{card.Id}",
            new CardRequest { Front = "hacked", Back = "hacked" },
            Cancellation);
        using var invalid = await owner.Client.PutAsJsonAsync(
            $"/api/cards/{card.Id}",
            new CardRequest { Front = "to run out of", Back = " " },
            Cancellation);

        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var stored = await StoredCardAsync(card.Id);
        Assert.Equal(("to run out of", "manquer de"), (stored.Front, stored.Back));
    }

    [Fact]
    public async Task Delete_RemovesTheCard_ButNotSomeoneElses()
    {
        using var owner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var deck = await owner.Client.CreateDeckAsync();
        var card = await owner.Client.AddCardAsync(deck.Id);
        var kept = await owner.Client.AddCardAsync(deck.Id, "a deadline", "une échéance");

        using var foreign = await stranger.Client.DeleteAsync($"/api/cards/{card.Id}", Cancellation);
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        Assert.Equal(2, await CardCountAsync(deck.Id));

        using var own = await owner.Client.DeleteAsync($"/api/cards/{card.Id}", Cancellation);
        Assert.Equal(HttpStatusCode.NoContent, own.StatusCode);
        Assert.False(await factory.QueryAsync(db => db.Cards.AnyAsync(c => c.Id == card.Id, Cancellation)));
        Assert.True(await factory.QueryAsync(db => db.Cards.AnyAsync(c => c.Id == kept.Id, Cancellation)));
    }

    [Theory]
    [InlineData("GET")]
    [InlineData("PUT")]
    [InlineData("DELETE")]
    public async Task Endpoints_RequireASession(string method)
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), $"/api/cards/{Guid.NewGuid()}")
        {
            Content = JsonContent.Create(new CardRequest { Front = "a", Back = "b" }),
        };

        using var response = await client.SendAsync(request, Cancellation);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private Task<Card> StoredCardAsync(Guid cardId) =>
        factory.QueryAsync(db => db.Cards.AsNoTracking().SingleAsync(c => c.Id == cardId, Cancellation));

    private Task<int> CardCountAsync(Guid deckId) =>
        factory.QueryAsync(db => db.Cards.CountAsync(c => c.DeckId == deckId, Cancellation));
}
