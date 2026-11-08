using System.Net;
using System.Net.Http.Json;
using Erudi.Api.Auth.Contracts;
using Erudi.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Tests.Auth;

/// <summary>Signing in with the Synapse account, signing out, and what the identity service sends back.</summary>
public sealed class SignInTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    private HttpClient Browser() => factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    private static Dictionary<string, object> Identity(Guid subject, string username, string sessionId = "sid-1") => new()
    {
        ["sub"] = subject.ToString(),
        ["preferred_username"] = username,
        ["email"] = $"{username}@example.test",
        ["locale"] = "fr",
        ["sid"] = sessionId,
    };

    /// <summary>Starts a sign-in and returns the query the identity service received.</summary>
    private static async Task<Dictionary<string, string>> StartAsync(HttpClient browser, string url = "/api/auth/login")
    {
        using var response = await browser.GetAsync(url, Cancellation);
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location!;
        Assert.StartsWith($"{FakeIdentityProvider.Issuer}/auth?", location.AbsoluteUri, StringComparison.Ordinal);
        return QueryHelpers.ParseQuery(location.Query).ToDictionary(p => p.Key, p => p.Value.ToString());
    }

    /// <summary>A full sign-in: the identity service vouches for <paramref name="identity"/>.</summary>
    private async Task<HttpResponseMessage> SignInAsync(HttpClient browser, Dictionary<string, object> identity, string url = "/api/auth/login")
    {
        var query = await StartAsync(browser, url);
        factory.Identity.Nonce = query["nonce"];
        factory.Identity.NextIdentity = identity;
        return await browser.GetAsync($"/api/auth/callback?code=the-code&state={Uri.EscapeDataString(query["state"])}", Cancellation);
    }

    [Fact]
    public async Task Login_SendsTheBrowserToTheIdentityService_WithPkceStateNonceAndLanguage()
    {
        using var browser = Browser();

        var query = await StartAsync(browser, "/api/auth/login?returnTo=%2Fdecks&lang=fr");

        Assert.Equal(FakeIdentityProvider.ClientId, query["client_id"]);
        Assert.Equal("code", query["response_type"]);
        // No form_post: the code comes back in a GET's query, the default for codes.
        Assert.False(query.ContainsKey("response_mode"));
        Assert.Equal("http://localhost/api/auth/callback", query["redirect_uri"]);
        Assert.Equal(["email", "openid", "profile"], query["scope"].Split(' ').Order());
        Assert.Equal("S256", query["code_challenge_method"]);
        Assert.NotEmpty(query["code_challenge"]);
        Assert.NotEmpty(query["state"]);
        Assert.NotEmpty(query["nonce"]);
        Assert.Equal("fr", query["ui_locales"]);
    }

    [Fact]
    public async Task Callback_OpensASession_AndCreatesTheLearnerWithTheAccountId()
    {
        using var browser = Browser();
        var subject = Guid.NewGuid();
        var username = $"Ada_{subject.ToString("N")[..8]}";

        using var callback = await SignInAsync(browser, Identity(subject, username), "/api/auth/login?returnTo=%2Fdecks%2F42");

        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        Assert.Equal("/decks/42", callback.Headers.Location!.OriginalString);
        var token = callback.SessionToken();
        Assert.NotNull(token);
        // The code was exchanged with the client's secret and the PKCE verifier.
        var exchange = factory.Identity.TokenRequests[^1];
        Assert.Contains("code=the-code", exchange, StringComparison.Ordinal);
        Assert.Contains("code_verifier=", exchange, StringComparison.Ordinal);

        var session = await factory.ClientWithSession(token).GetFromJsonAsync<AuthUserResponse>("/api/auth/session", Cancellation);
        Assert.Equal(new AuthUserResponse(subject, username, $"{username}@example.test", TermsAccepted: false), session);
        Assert.Equal("sid-1", await factory.QueryAsync(db => db.Sessions
            .Where(s => s.UserId == subject)
            .Select(s => s.OidcSid)
            .SingleAsync(Cancellation)));
    }

    [Fact]
    public async Task ASecondSignIn_RefreshesTheUsername_AndKeepsTheLearnersData()
    {
        var subject = Guid.NewGuid();
        using (var first = Browser())
        {
            using var signedIn = await SignInAsync(first, Identity(subject, $"old_{subject.ToString("N")[..8]}"));
            using var accepted = await factory.ClientWithSession(signedIn.SessionToken()!).PostAsync("/api/account/terms", null, Cancellation);
            Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        }

        using var second = Browser();
        var renamed = $"new_{subject.ToString("N")[..8]}";
        using var callback = await SignInAsync(second, Identity(subject, renamed, "sid-2"));

        var session = await factory.ClientWithSession(callback.SessionToken()!)
            .GetFromJsonAsync<AuthUserResponse>("/api/auth/session", Cancellation);
        Assert.Equal(renamed, session!.Username);
        Assert.True(session.TermsAccepted);
        Assert.Equal(1, await factory.QueryAsync(db => db.Users.CountAsync(u => u.Id == subject, Cancellation)));
    }

    [Fact]
    public async Task Callback_WhenThePersonWentBack_OpensNothingAndSaysCancelled()
    {
        using var browser = Browser();
        var query = await StartAsync(browser);
        var requests = factory.Identity.TokenRequests.Count;

        using var callback = await browser.GetAsync(
            $"/api/auth/callback?error=access_denied&state={Uri.EscapeDataString(query["state"])}",
            Cancellation);

        Assert.Equal("/sign-in?signIn=cancelled", callback.Headers.Location!.OriginalString);
        Assert.Null(callback.SessionToken());
        Assert.Equal(requests, factory.Identity.TokenRequests.Count);
    }

    [Fact]
    public async Task Callback_WithoutThisBrowsersSignIn_OpensNothing()
    {
        using var starter = Browser();
        var query = await StartAsync(starter);
        factory.Identity.Nonce = query["nonce"];
        factory.Identity.NextIdentity = Identity(Guid.NewGuid(), "intruder");

        // Another browser, without the state and nonce cookies, brings the code back.
        using var other = Browser();
        using var callback = await other.GetAsync(
            $"/api/auth/callback?code=the-code&state={Uri.EscapeDataString(query["state"])}",
            Cancellation);

        Assert.Equal("/sign-in?signIn=failed", callback.Headers.Location!.OriginalString);
        Assert.Null(callback.SessionToken());
    }

    [Theory]
    [InlineData("https%3A%2F%2Fevil.example%2F")]
    [InlineData("%2F%2Fevil.example")]
    [InlineData("%2Fapi%2Fdecks")]
    public async Task Callback_NeverReturnsToAnotherSite(string returnTo)
    {
        using var browser = Browser();

        using var callback = await SignInAsync(browser, Identity(Guid.NewGuid(), $"u_{Guid.NewGuid():N}"[..20]), $"/api/auth/login?returnTo={returnTo}");

        Assert.Equal("/", callback.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Logout_EndsTheSession_AndPointsToTheIdentityServiceToSignOutEverywhere()
    {
        var session = await factory.SignInDirectlyAsync(TestAccounts.NewIdentity());
        using var client = factory.ClientWithSession(session.Token);

        using var response = await client.PostAsync("/api/auth/logout", null, Cancellation);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<SignOutResponse>(Cancellation);
        Assert.Equal(
            $"{FakeIdentityProvider.Issuer}/session/end?client_id=erudi&post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A4200%2Fwelcome",
            body!.RedirectTo);
        using var after = await client.GetAsync("/api/auth/session", Cancellation);
        Assert.Equal(HttpStatusCode.Unauthorized, after.StatusCode);
    }

    [Fact]
    public async Task BackchannelLogout_EndsTheSessionsOpenedFromThatIdentitySession()
    {
        var identity = TestAccounts.NewIdentity("sid-a");
        var fromA = await factory.SignInDirectlyAsync(identity);
        var fromB = await factory.SignInDirectlyAsync(identity with { SessionId = "sid-b" });
        using var server = factory.CreateClientWithoutCookies();

        using var response = await server.PostAsync(
            "/api/auth/backchannel-logout",
            new FormUrlEncodedContent(new Dictionary<string, string> { ["logout_token"] = factory.Identity.LogoutToken(identity.Subject, "sid-a") }),
            Cancellation);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, await SessionStatusAsync(fromA.Token));
        Assert.Equal(HttpStatusCode.OK, await SessionStatusAsync(fromB.Token));
    }

    [Fact]
    public async Task BackchannelLogout_RefusesATokenForAnotherApp_AndEndsNothing()
    {
        var identity = TestAccounts.NewIdentity("sid-c");
        var session = await factory.SignInDirectlyAsync(identity);
        using var server = factory.CreateClientWithoutCookies();

        foreach (var token in new[] { factory.Identity.LogoutToken(identity.Subject, "sid-c", audience: "plano"), "not-a-token" })
        {
            using var response = await server.PostAsync(
                "/api/auth/backchannel-logout",
                new FormUrlEncodedContent(new Dictionary<string, string> { ["logout_token"] = token }),
                Cancellation);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        Assert.Equal(HttpStatusCode.OK, await SessionStatusAsync(session.Token));
    }

    [Fact]
    public async Task AccountDeleted_ErasesTheLearnerAndWhatTheyOwn()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();
        await learner.Client.AddCardAsync(deck.Id);
        using var someoneElse = await factory.SignInNewLearnerAsync();
        await someoneElse.Client.CreateDeckAsync();
        using var server = factory.CreateClientWithoutCookies();

        using var response = await server.PostAsync(
            "/api/auth/account-deleted",
            new StringContent(factory.Identity.DeletionNotice(learner.Id), null, "application/secevent+jwt"),
            Cancellation);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.False(await factory.QueryAsync(db => db.Users.AnyAsync(u => u.Id == learner.Id, Cancellation)));
        Assert.False(await factory.QueryAsync(db => db.Decks.AnyAsync(d => d.OwnerId == learner.Id, Cancellation)));
        Assert.True(await factory.QueryAsync(db => db.Decks.AnyAsync(d => d.OwnerId == someoneElse.Id, Cancellation)));
    }

    [Fact]
    public async Task AccountDeleted_RefusesANoticeForAnotherAppOrALogoutToken()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        using var server = factory.CreateClientWithoutCookies();

        foreach (var notice in new[]
                 {
                     factory.Identity.DeletionNotice(learner.Id, audience: "plano"),
                     factory.Identity.LogoutToken(learner.Id, null),
                 })
        {
            using var response = await server.PostAsync(
                "/api/auth/account-deleted",
                new StringContent(notice, null, "application/secevent+jwt"),
                Cancellation);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        Assert.True(await factory.QueryAsync(db => db.Users.AnyAsync(u => u.Id == learner.Id, Cancellation)));
    }

    [Fact]
    public async Task AcceptTerms_IsRecordedOnce_AndNeedsASession()
    {
        using var anonymous = factory.CreateClientWithoutCookies();
        using var refused = await anonymous.PostAsync("/api/account/terms", null, Cancellation);
        Assert.Equal(HttpStatusCode.Unauthorized, refused.StatusCode);

        var session = await factory.SignInDirectlyAsync(TestAccounts.NewIdentity());
        using var client = factory.ClientWithSession(session.Token);
        using var first = await client.PostAsync("/api/account/terms", null, Cancellation);
        var firstDate = await factory.QueryAsync(db => db.Users.Where(u => u.Id == session.User.Id).Select(u => u.TermsAcceptedAt).SingleAsync(Cancellation));
        factory.Clock.Advance(TimeSpan.FromDays(1));
        using var second = await client.PostAsync("/api/account/terms", null, Cancellation);

        Assert.True((await first.Content.ReadFromJsonAsync<AuthUserResponse>(Cancellation))!.TermsAccepted);
        Assert.NotNull(firstDate);
        Assert.Equal(firstDate, await factory.QueryAsync(db => db.Users.Where(u => u.Id == session.User.Id).Select(u => u.TermsAcceptedAt).SingleAsync(Cancellation)));
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
    }

    private async Task<HttpStatusCode> SessionStatusAsync(string token)
    {
        using var response = await factory.ClientWithSession(token).GetAsync("/api/auth/session", Cancellation);
        return response.StatusCode;
    }
}
