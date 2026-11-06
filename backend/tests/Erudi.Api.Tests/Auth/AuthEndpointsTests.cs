using System.Net;
using System.Net.Http.Json;
using System.Text;
using Erudi.Api.Auth;
using Erudi.Api.Auth.Contracts;
using Erudi.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Tests.Auth;

public sealed class AuthEndpointsTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    public static TheoryData<string, string> InvalidRegistrations => new()
    {
        { "username", """{"username":"ab","email":"a@example.test","password":"long enough","acceptedTerms":true}""" },
        { "username", """{"username":"with space","email":"a@example.test","password":"long enough","acceptedTerms":true}""" },
        { "email", """{"username":"valid_name","email":"not-an-email","password":"long enough","acceptedTerms":true}""" },
        { "password", """{"username":"valid_name","email":"a@example.test","password":"short","acceptedTerms":true}""" },
        { "acceptedTerms", """{"username":"valid_name","email":"a@example.test","password":"long enough","acceptedTerms":false}""" },
        { "username", """{"email":"a@example.test","password":"long enough","acceptedTerms":true}""" },
    };

    [Fact]
    public async Task Register_CreatesTheAccountAndSignsTheClientIn()
    {
        using var client = factory.CreateClient();
        var account = TestAccounts.New();

        using var response = await client.PostAsJsonAsync("/api/auth/register", account, Cancellation);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var user = await response.Content.ReadFromJsonAsync<AuthUserResponse>(Cancellation);
        Assert.NotNull(user);
        Assert.Equal(account.Username, user.Username);
        Assert.Equal(account.Email, user.Email);

        var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"));
        Assert.StartsWith($"{SessionCookie.Name}=", cookie, StringComparison.Ordinal);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/api", cookie, StringComparison.OrdinalIgnoreCase);

        Assert.Equal(user, await client.GetFromJsonAsync<AuthUserResponse>("/api/auth/session", Cancellation));
    }

    [Fact]
    public async Task Register_StoresOnlyHashesAndNormalizedIdentifiers()
    {
        using var client = factory.CreateClient();
        var account = TestAccounts.New();

        using var response = await client.PostAsJsonAsync("/api/auth/register", account, Cancellation);
        var token = response.SessionToken();
        var user = await response.Content.ReadFromJsonAsync<AuthUserResponse>(Cancellation);

        var stored = await factory.QueryAsync(db => db.Users.SingleAsync(u => u.Id == user!.Id, Cancellation));
        Assert.NotEqual(account.Password, stored.PasswordHash);
        Assert.DoesNotContain(account.Password, stored.PasswordHash, StringComparison.Ordinal);
        Assert.Equal(account.Username.ToLowerInvariant(), stored.NormalizedUsername);
        Assert.Equal(account.Email.ToLowerInvariant(), stored.NormalizedEmail);
        Assert.Equal(factory.Clock.GetUtcNow(), stored.TermsAcceptedAt);
        Assert.Equal("fr", stored.Locale);

        var session = await factory.QueryAsync(db => db.Sessions.SingleAsync(s => s.UserId == stored.Id, Cancellation));
        Assert.NotNull(token);
        Assert.Equal(SecureTokens.Hash(token), session.TokenHash);
        Assert.Equal(factory.Clock.GetUtcNow().AddDays(30), session.ExpiresAt);
    }

    [Theory]
    [MemberData(nameof(InvalidRegistrations))]
    public async Task Register_RejectsInvalidInputWithoutCreatingAnything(string invalidField, string body)
    {
        using var client = factory.CreateClient();
        var countBefore = await factory.QueryAsync(db => db.Users.CountAsync(Cancellation));

        using var response = await client.PostAsync(
            "/api/auth/register",
            new StringContent(body, Encoding.UTF8, "application/json"),
            Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation);
        Assert.Contains(invalidField, problem!.Errors.Keys);
        Assert.Null(response.SessionToken());
        Assert.Equal(countBefore, await factory.QueryAsync(db => db.Users.CountAsync(Cancellation)));
    }

    [Fact]
    public async Task Register_RejectsATakenUsernameWhateverItsCase()
    {
        using var client = factory.CreateClient();
        var first = TestAccounts.New();
        await client.RegisterAsync(first);
        var second = TestAccounts.New();

        using var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest { Username = first.Username.ToUpperInvariant(), Email = second.Email, Password = second.Password, AcceptedTerms = true },
            Cancellation);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation);
        Assert.Equal(["username"], problem!.Errors.Keys);
        Assert.Null(response.SessionToken());
        var normalizedEmail = second.Email.ToLowerInvariant();
        Assert.False(await factory.QueryAsync(db => db.Users.AnyAsync(u => u.NormalizedEmail == normalizedEmail, Cancellation)));
    }

    [Fact]
    public async Task Register_RejectsATakenEmailWhateverItsCaseAndSpaces()
    {
        using var client = factory.CreateClient();
        var first = TestAccounts.New();
        await client.RegisterAsync(first);
        var second = TestAccounts.New();

        using var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest { Username = second.Username, Email = $" {first.Email.ToUpperInvariant()} ", Password = second.Password, AcceptedTerms = true },
            Cancellation);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation);
        Assert.Equal(["email"], problem!.Errors.Keys);
        var normalizedUsername = second.Username.ToLowerInvariant();
        Assert.False(await factory.QueryAsync(db => db.Users.AnyAsync(u => u.NormalizedUsername == normalizedUsername, Cancellation)));
    }

    [Fact]
    public async Task Login_SignsInWithTheEmailInAnyCase()
    {
        var account = TestAccounts.New();
        using (var registering = factory.CreateClient())
        {
            await registering.RegisterAsync(account);
        }

        using var client = factory.CreateClient();
        using var response = await client.PostAsJsonAsync(
            "/api/auth/login",
            new LoginRequest { Email = $" {account.Email.ToUpperInvariant()} ", Password = account.Password },
            Cancellation);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var user = await response.Content.ReadFromJsonAsync<AuthUserResponse>(Cancellation);
        Assert.Equal(account.Username, user!.Username);
        Assert.NotNull(response.SessionToken());
        Assert.Equal(user, await client.GetFromJsonAsync<AuthUserResponse>("/api/auth/session", Cancellation));
        Assert.Equal(2, await factory.QueryAsync(db => db.Sessions.CountAsync(s => s.UserId == user.Id, Cancellation)));
    }

    [Fact]
    public async Task Login_AnswersTheSameForAWrongPasswordAndAnUnknownEmail()
    {
        using var client = factory.CreateClient();
        var account = TestAccounts.New();
        var user = await client.RegisterAsync(account);

        using var wrongPassword = await client.PostAsJsonAsync(
            "/api/auth/login", new LoginRequest { Email = account.Email, Password = "not the password" }, Cancellation);
        using var unknownEmail = await client.PostAsJsonAsync(
            "/api/auth/login", new LoginRequest { Email = $"nobody.{Guid.NewGuid():N}@example.test", Password = account.Password }, Cancellation);

        foreach (var response in new[] { wrongPassword, unknownEmail })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>(Cancellation);
            Assert.Equal("Invalid credentials", problem!.Title);
            Assert.Null(response.SessionToken());
        }

        Assert.Equal(1, await factory.QueryAsync(db => db.Sessions.CountAsync(s => s.UserId == user.Id, Cancellation)));
    }

    [Fact]
    public async Task Login_CleansUpExpiredSessions()
    {
        var account = TestAccounts.New();
        using var oldClient = factory.CreateClient();
        var user = await oldClient.RegisterAsync(account);
        factory.Clock.Advance(TimeSpan.FromDays(31));

        using var client = factory.CreateClient();
        using var response = await client.PostAsJsonAsync(
            "/api/auth/login", new LoginRequest { Email = account.Email, Password = account.Password }, Cancellation);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var remaining = await factory.QueryAsync(db => db.Sessions.Where(s => s.UserId == user.Id).ToListAsync(Cancellation));
        var session = Assert.Single(remaining);
        Assert.Equal(SecureTokens.Hash(response.SessionToken()!), session.TokenHash);
    }

    [Fact]
    public async Task Session_WithoutCookie_AnswersUnauthorizedProblemDetails()
    {
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/auth/session", Cancellation);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Theory]
    [InlineData("not-a-token")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")]
    public async Task Session_WithAnUnknownToken_AnswersUnauthorized(string token)
    {
        using var client = factory.CreateClientWithoutCookies();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/session").WithSession(token);

        using var response = await client.SendAsync(request, Cancellation);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Session_OnceExpired_AnswersUnauthorizedAndIsDeleted()
    {
        using var client = factory.CreateClient();
        var user = await client.RegisterAsync(TestAccounts.New());
        factory.Clock.Advance(TimeSpan.FromDays(30));

        using var response = await client.GetAsync("/api/auth/session", Cancellation);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(await factory.QueryAsync(db => db.Sessions.AnyAsync(s => s.UserId == user.Id, Cancellation)));
    }

    [Fact]
    public async Task Logout_RevokesTheSessionOnTheServerAndClearsTheCookie()
    {
        using var client = factory.CreateClientWithoutCookies();
        using var registration = await client.PostAsJsonAsync("/api/auth/register", TestAccounts.New(), Cancellation);
        var token = registration.SessionToken()!;
        var user = await registration.Content.ReadFromJsonAsync<AuthUserResponse>(Cancellation);

        using var logout = new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout").WithSession(token);
        using var response = await client.SendAsync(logout, Cancellation);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var cleared = Assert.Single(response.Headers.GetValues("Set-Cookie"));
        Assert.StartsWith($"{SessionCookie.Name}=;", cleared, StringComparison.Ordinal);
        Assert.Contains("expires=Thu, 01 Jan 1970", cleared, StringComparison.OrdinalIgnoreCase);
        Assert.False(await factory.QueryAsync(db => db.Sessions.AnyAsync(s => s.UserId == user!.Id, Cancellation)));

        // Even a client that kept the old cookie is signed out.
        using var replay = new HttpRequestMessage(HttpMethod.Get, "/api/auth/session").WithSession(token);
        using var replayed = await client.SendAsync(replay, Cancellation);
        Assert.Equal(HttpStatusCode.Unauthorized, replayed.StatusCode);
    }

    [Fact]
    public async Task Logout_WithoutSession_StillSucceeds()
    {
        using var client = factory.CreateClient();
        var sessionsBefore = await factory.QueryAsync(db => db.Sessions.CountAsync(Cancellation));

        using var response = await client.PostAsync("/api/auth/logout", content: null, Cancellation);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(sessionsBefore, await factory.QueryAsync(db => db.Sessions.CountAsync(Cancellation)));
    }
}
