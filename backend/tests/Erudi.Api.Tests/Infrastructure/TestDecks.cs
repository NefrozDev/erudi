using System.Net.Http.Json;
using Erudi.Api.Decks.Contracts;

namespace Erudi.Api.Tests.Infrastructure;

internal static class TestDecks
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    public static async Task<TestLearner> SignInNewLearnerAsync(this ErudiApiFactory factory)
    {
        var client = factory.CreateClient();
        var user = await client.RegisterAsync(TestAccounts.New());
        return new TestLearner(client, user.Id);
    }

    public static async Task<DeckResponse> CreateDeckAsync(this HttpClient client, string name = "Anglais")
    {
        using var response = await client.PostAsJsonAsync("/api/decks", new DeckRequest { Name = name }, Cancellation);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<DeckResponse>(Cancellation))!;
    }

    public static async Task<CardResponse> AddCardAsync(
        this HttpClient client,
        Guid deckId,
        string front = "to run out of",
        string back = "manquer de")
    {
        using var response = await client.PostAsJsonAsync(
            $"/api/decks/{deckId}/cards",
            new CardRequest { Front = front, Back = back },
            Cancellation);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CardResponse>(Cancellation))!;
    }

    /// <summary>The default learner's day (Brussels) at the factory's current time.</summary>
    public static DateOnly Today(this ErudiApiFactory factory)
    {
        var brussels = TimeZoneInfo.FindSystemTimeZoneById("Europe/Brussels");
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(factory.Clock.GetUtcNow(), brussels).DateTime);
    }
}

/// <summary>A brand-new account and a client that keeps its session cookie.</summary>
internal sealed class TestLearner(HttpClient client, Guid id) : IDisposable
{
    public HttpClient Client { get; } = client;

    public Guid Id { get; } = id;

    public void Dispose() => Client.Dispose();
}
