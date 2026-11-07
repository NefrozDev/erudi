using System.Net;
using System.Net.Http.Json;
using System.Text;
using Erudi.Api.Auth.Contracts;
using Erudi.Api.Decks.Contracts;
using Erudi.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Erudi.Api.Tests.Auth;

public sealed class AccountDeletionTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Delete_WithThePassword_RemovesTheAccountAndEverythingItOwns()
    {
        var account = TestAccounts.New();
        using var client = factory.CreateClient();
        using var registration = await client.PostAsJsonAsync("/api/auth/register", account, Cancellation);
        var token = registration.SessionToken()!;
        var leaving = (await registration.Content.ReadFromJsonAsync<AuthUserResponse>(Cancellation))!;
        using var reader = await factory.SignInNewLearnerAsync();

        // Everything a learner leaves behind: a published deck with a card and an answer,
        // a pending password reset, a test score and a report on someone else's deck.
        var deck = await client.CreateDeckAsync("Permis");
        var card = await client.AddCardAsync(deck.Id);
        using (var answer = await client.PostAsJsonAsync("/api/study/answers", new { cardId = card.Id, knew = true }, Cancellation))
        {
            answer.EnsureSuccessStatusCode();
        }

        await client.PublishAsync(deck.Id);
        using (var reset = await client.PostAsJsonAsync("/api/auth/password-reset", new { email = account.Email }, Cancellation))
        {
            reset.EnsureSuccessStatusCode();
        }

        var readersDeck = await reader.Client.CreateDeckAsync("Histoire");
        await reader.Client.AddCardAsync(readersDeck.Id);
        await reader.Client.PublishAsync(readersDeck.Id, title: "Histoire de Belgique");
        await PostAsync(client, $"/api/explore/{readersDeck.Id}/results", new { known = 1, total = 1 });
        await PostAsync(client, $"/api/explore/{readersDeck.Id}/reports", new { reason = "spam" });
        var copy = await PostAsync<DeckResponse>(reader.Client, $"/api/explore/{deck.Id}/copies", null);

        using var response = await DeleteAccountAsync(client, TestAccounts.Password);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"));
        Assert.StartsWith("erudi_session=;", cookie, StringComparison.Ordinal);
        Assert.Contains("expires=Thu, 01 Jan 1970", cookie, StringComparison.OrdinalIgnoreCase);

        // The session is gone on the server too, not only from this browser.
        using var anonymous = factory.CreateClientWithoutCookies();
        using var sessionCheck = await anonymous.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, "/api/auth/session").WithSession(token),
            Cancellation);
        Assert.Equal(HttpStatusCode.Unauthorized, sessionCheck.StatusCode);

        var leftovers = await factory.QueryAsync(async db => new[]
        {
            await db.Users.CountAsync(u => u.Id == leaving.Id, Cancellation),
            await db.Sessions.CountAsync(s => s.UserId == leaving.Id, Cancellation),
            await db.PasswordResets.CountAsync(r => r.UserId == leaving.Id, Cancellation),
            await db.Decks.CountAsync(d => d.OwnerId == leaving.Id, Cancellation),
            await db.Cards.CountAsync(c => c.DeckId == deck.Id, Cancellation),
            await db.CardReviews.CountAsync(r => r.UserId == leaving.Id, Cancellation),
            await db.DeckPublications.CountAsync(p => p.DeckId == deck.Id, Cancellation),
            await db.DeckUses.CountAsync(u => u.UserId == leaving.Id || u.DeckId == deck.Id, Cancellation),
            await db.DeckReports.CountAsync(r => r.ReporterId == leaving.Id, Cancellation),
        });
        Assert.All(leftovers, count => Assert.Equal(0, count));

        // The copy belongs to the reader, and their own publication stays public.
        var readersCopy = await reader.Client.GetFromJsonAsync<DeckResponse>($"/api/decks/{copy.Id}", Cancellation);
        Assert.Equal(1, readersCopy!.CardCount);
        using var readersPublication = await reader.Client.GetAsync($"/api/explore/{readersDeck.Id}", Cancellation);
        Assert.Equal(HttpStatusCode.OK, readersPublication.StatusCode);
        using var deletedPublication = await reader.Client.GetAsync($"/api/explore/{deck.Id}", Cancellation);
        Assert.Equal(HttpStatusCode.NotFound, deletedPublication.StatusCode);

        // The credentials no longer work, and the name and address are free again.
        using var login = await anonymous.PostAsJsonAsync(
            "/api/auth/login",
            new LoginRequest { Email = account.Email, Password = account.Password },
            Cancellation);
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
        using var again = await anonymous.PostAsJsonAsync("/api/auth/register", account, Cancellation);
        Assert.Equal(HttpStatusCode.Created, again.StatusCode);
    }

    [Fact]
    public async Task Delete_WithAWrongPassword_KeepsEverything()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();

        using var response = await DeleteAccountAsync(learner.Client, "not my password");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation);
        Assert.Equal(["password"], problem!.Errors.Keys);
        Assert.False(response.Headers.Contains("Set-Cookie"));
        await AssertAccountKeptAsync(learner, deck.Id);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("""{"password":""}""")]
    public async Task Delete_WithoutAPassword_IsRefused(string body)
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();

        using var response = await learner.Client.SendAsync(
            new HttpRequestMessage(HttpMethod.Delete, "/api/account")
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            },
            Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation);
        Assert.Equal(["password"], problem!.Errors.Keys);
        await AssertAccountKeptAsync(learner, deck.Id);
    }

    [Fact]
    public async Task Delete_RequiresASession()
    {
        var usersBefore = await factory.QueryAsync(db => db.Users.CountAsync(Cancellation));
        using var client = factory.CreateClient();

        using var response = await DeleteAccountAsync(client, TestAccounts.Password);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(usersBefore, await factory.QueryAsync(db => db.Users.CountAsync(Cancellation)));
    }

    [Fact]
    public async Task Delete_IsRateLimited_AgainstPasswordGuessing()
    {
        using var limitedFactory = factory.WithWebHostBuilder(host => host.ConfigureAppConfiguration((_, configuration) =>
            configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Auth:RateLimitPerMinute"] = "2" })));
        using var client = limitedFactory.CreateClient();
        // Registering uses the first permit of the minute.
        await client.RegisterAsync(TestAccounts.New());

        using var guess = await DeleteAccountAsync(client, "guess number 1");
        using var blocked = await DeleteAccountAsync(client, TestAccounts.Password);

        Assert.Equal(HttpStatusCode.BadRequest, guess.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
        using var session = await client.GetAsync("/api/auth/session", Cancellation);
        Assert.Equal(HttpStatusCode.OK, session.StatusCode);
    }

    private static Task<HttpResponseMessage> DeleteAccountAsync(HttpClient client, string password) =>
        client.SendAsync(
            new HttpRequestMessage(HttpMethod.Delete, "/api/account")
            {
                Content = JsonContent.Create(new AccountDeletionRequest { Password = password }),
            },
            Cancellation);

    private async Task AssertAccountKeptAsync(TestLearner learner, Guid deckId)
    {
        using var session = await learner.Client.GetAsync("/api/auth/session", Cancellation);
        Assert.Equal(HttpStatusCode.OK, session.StatusCode);
        Assert.True(await factory.QueryAsync(db => db.Decks.AnyAsync(d => d.Id == deckId, Cancellation)));
    }

    private static async Task PostAsync(HttpClient client, string url, object? body)
    {
        using var response = await client.PostAsJsonAsync(url, body, Cancellation);
        response.EnsureSuccessStatusCode();
    }

    private static async Task<T> PostAsync<T>(HttpClient client, string url, object? body)
    {
        using var response = await client.PostAsJsonAsync(url, body, Cancellation);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>(Cancellation))!;
    }
}
