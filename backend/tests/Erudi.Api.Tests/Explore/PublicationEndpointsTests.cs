using System.Net;
using System.Net.Http.Json;
using System.Text;
using Erudi.Api.Decks.Contracts;
using Erudi.Api.Explore;
using Erudi.Api.Explore.Contracts;
using Erudi.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Tests.Explore;

public sealed class PublicationEndpointsTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    public static TheoryData<string, string> InvalidPublications => new()
    {
        { "title", """{"category":"driving"}""" },
        { "title", """{"title":"  ","category":"driving"}""" },
        { "title", $$"""{"title":"{{new string('a', ExploreRules.TitleMaxLength + 1)}}","category":"driving"}""" },
        { "category", """{"title":"Code de la route"}""" },
        { "category", """{"title":"Code de la route","category":9}""" },
        { "description", $$"""{"title":"Code","category":"driving","description":"{{new string('a', ExploreRules.DescriptionMaxLength + 1)}}"}""" },
    };

    [Fact]
    public async Task Publish_StoresTheTrimmedPublication_AndMarksTheDeckAsPublished()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync("Permis");
        await learner.Client.AddCardAsync(deck.Id, "Triangle pointe en bas ?", "Cédez le passage");
        var now = factory.Clock.GetUtcNow();

        using var response = await learner.Client.PutAsJsonAsync(
            $"/api/decks/{deck.Id}/publication",
            new PublicationRequest { Title = "  Code de la route  ", Category = DeckCategory.Driving, Description = " Panneaux et priorités " },
            Cancellation);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var expected = new PublicationResponse("Code de la route", DeckCategory.Driving, "Panneaux et priorités", now, now);
        Assert.Equal(expected, await response.Content.ReadFromJsonAsync<PublicationResponse>(Cancellation));
        Assert.Contains("\"category\":\"driving\"", await response.Content.ReadAsStringAsync(Cancellation), StringComparison.Ordinal);
        Assert.Equal(expected, await learner.Client.GetFromJsonAsync<PublicationResponse>($"/api/decks/{deck.Id}/publication", Cancellation));

        var stored = await StoredAsync(deck.Id);
        Assert.Equal(("Code de la route", DeckCategory.Driving, "Panneaux et priorités"), (stored!.Title, stored.Category, stored.Description));
        // The deck keeps its own name: the title is for the Explorer.
        var ownDeck = await learner.Client.GetFromJsonAsync<DeckResponse>($"/api/decks/{deck.Id}", Cancellation);
        Assert.Equal(("Permis", true), (ownDeck!.Name, ownDeck.Published));
    }

    [Fact]
    public async Task Publish_WithoutADescription_StoresAnEmptyOne()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        await learner.Client.AddCardAsync(deck.Id);

        using var response = await learner.Client.PutAsJsonAsync(
            $"/api/decks/{deck.Id}/publication",
            new { title = "Anglais", category = "languages" },
            Cancellation);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("", (await StoredAsync(deck.Id))!.Description);
    }

    [Fact]
    public async Task Publish_Again_UpdatesThePublicationButKeepsItsFirstDate()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        await learner.Client.AddCardAsync(deck.Id);
        var first = await learner.Client.PublishAsync(deck.Id, "Anglais", DeckCategory.Languages, "Vocabulaire");

        factory.Clock.Advance(TimeSpan.FromDays(3));
        var second = await learner.Client.PublishAsync(deck.Id, "Anglais B2", DeckCategory.Studies, "");

        Assert.Equal(
            new PublicationResponse("Anglais B2", DeckCategory.Studies, "", first.PublishedAt, factory.Clock.GetUtcNow()),
            second);
        Assert.Equal(1, await factory.QueryAsync(db => db.DeckPublications.CountAsync(p => p.DeckId == deck.Id, Cancellation)));
    }

    [Fact]
    public async Task Publish_RefusesADeckWithoutCards()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();

        using var response = await learner.Client.PutAsJsonAsync(
            $"/api/decks/{deck.Id}/publication",
            new PublicationRequest { Title = "Anglais", Category = DeckCategory.Languages },
            Cancellation);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Deck is empty", (await response.Content.ReadFromJsonAsync<ProblemDetails>(Cancellation))!.Title);
        Assert.Null(await StoredAsync(deck.Id));
    }

    [Theory]
    [MemberData(nameof(InvalidPublications))]
    public async Task Publish_RejectsAnInvalidPublication(string invalidField, string body)
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        await learner.Client.AddCardAsync(deck.Id);

        using var response = await learner.Client.PutAsync(
            $"/api/decks/{deck.Id}/publication",
            new StringContent(body, Encoding.UTF8, "application/json"),
            Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation);
        Assert.Equal([invalidField], problem!.Errors.Keys);
        Assert.Null(await StoredAsync(deck.Id));
    }

    [Fact]
    public async Task Publish_RejectsAnUnknownCategoryName()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        await learner.Client.AddCardAsync(deck.Id);

        using var response = await learner.Client.PutAsJsonAsync(
            $"/api/decks/{deck.Id}/publication",
            new { title = "Anglais", category = "cooking" },
            Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null(await StoredAsync(deck.Id));
    }

    [Fact]
    public async Task SomeoneElsesDeck_CannotBePublishedReadOrUnpublished()
    {
        using var owner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var published = await owner.Client.CreateDeckAsync("Permis");
        var draft = await owner.Client.CreateDeckAsync("Brouillon");
        await owner.Client.AddCardAsync(published.Id);
        await owner.Client.AddCardAsync(draft.Id);
        var publication = await owner.Client.PublishAsync(published.Id);

        using var publishDraft = await stranger.Client.PutAsJsonAsync(
            $"/api/decks/{draft.Id}/publication",
            new PublicationRequest { Title = "Hacked", Category = DeckCategory.Other },
            Cancellation);
        using var overwrite = await stranger.Client.PutAsJsonAsync(
            $"/api/decks/{published.Id}/publication",
            new PublicationRequest { Title = "Hacked", Category = DeckCategory.Other },
            Cancellation);
        using var read = await stranger.Client.GetAsync($"/api/decks/{published.Id}/publication", Cancellation);
        using var unpublish = await stranger.Client.DeleteAsync($"/api/decks/{published.Id}/publication", Cancellation);

        Assert.Equal(HttpStatusCode.NotFound, publishDraft.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, overwrite.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, read.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, unpublish.StatusCode);
        Assert.Null(await StoredAsync(draft.Id));
        Assert.Equal(publication.Title, (await StoredAsync(published.Id))!.Title);
    }

    [Fact]
    public async Task Get_AnswersNotFoundForADeckThatIsNotPublished()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();

        using var response = await learner.Client.GetAsync($"/api/decks/{deck.Id}/publication", Cancellation);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Unpublish_RemovesThePublication_ButKeepsTheDeck()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        await learner.Client.AddCardAsync(deck.Id);
        await learner.Client.PublishAsync(deck.Id);

        using var response = await learner.Client.DeleteAsync($"/api/decks/{deck.Id}/publication", Cancellation);
        using var again = await learner.Client.DeleteAsync($"/api/decks/{deck.Id}/publication", Cancellation);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, again.StatusCode);
        Assert.Null(await StoredAsync(deck.Id));
        var kept = await learner.Client.GetFromJsonAsync<DeckResponse>($"/api/decks/{deck.Id}", Cancellation);
        Assert.Equal((1, false), (kept!.CardCount, kept.Published));
    }

    [Fact]
    public async Task DeletingTheDeck_RemovesItsPublication()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        await learner.Client.AddCardAsync(deck.Id);
        await learner.Client.PublishAsync(deck.Id);

        using var response = await learner.Client.DeleteAsync($"/api/decks/{deck.Id}", Cancellation);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await StoredAsync(deck.Id));
    }

    [Theory]
    [InlineData("GET")]
    [InlineData("PUT")]
    [InlineData("DELETE")]
    public async Task Endpoints_RequireASession(string method)
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), $"/api/decks/{Guid.NewGuid()}/publication")
        {
            Content = JsonContent.Create(new PublicationRequest { Title = "Anglais", Category = DeckCategory.Languages }),
        };

        using var response = await client.SendAsync(request, Cancellation);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private Task<DeckPublication?> StoredAsync(Guid deckId) =>
        factory.QueryAsync(db => db.DeckPublications.AsNoTracking().SingleOrDefaultAsync(p => p.DeckId == deckId, Cancellation));
}
