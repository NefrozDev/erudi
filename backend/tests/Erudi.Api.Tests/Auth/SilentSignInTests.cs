using System.Net;
using System.Net.Http.Json;
using Erudi.Api.Auth;
using Erudi.Api.Auth.Contracts;
using Erudi.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;

namespace Erudi.Api.Tests.Auth;

/// <summary>
/// Signing in on arrival with <c>prompt=none</c>: signed in when the Synapse session exists,
/// back on the screen asked for with <c>?signIn=none</c> otherwise, never on an error page.
/// </summary>
public sealed class SilentSignInTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    private const string SilentLogin = "/api/auth/login?silent=true&returnTo=%2Fdecks%2F42&lang=fr";

    private HttpClient Browser(bool handleCookies = true) => factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false,
        HandleCookies = handleCookies,
    });

    private static async Task<Dictionary<string, string>> StartAsync(HttpClient browser, string url)
    {
        using var response = await browser.GetAsync(url, Cancellation);
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location!;
        Assert.StartsWith($"{FakeIdentityProvider.Issuer}/auth?", location.AbsoluteUri, StringComparison.Ordinal);
        return QueryHelpers.ParseQuery(location.Query).ToDictionary(p => p.Key, p => p.Value.ToString());
    }

    private static Task<HttpResponseMessage> ComeBackWithErrorAsync(HttpClient browser, string state, string error) =>
        browser.GetAsync($"/api/auth/callback?error={error}&state={Uri.EscapeDataString(state)}", Cancellation);

    private static string? SilentCookie(HttpResponseMessage response) =>
        response.Headers.TryGetValues("Set-Cookie", out var cookies)
            ? cookies.SingleOrDefault(c => c.StartsWith($"{SilentSignIn.CookieName}=", StringComparison.Ordinal))
            : null;

    [Fact]
    public async Task SilentLogin_AsksTheIdentityServiceToShowNothing_AndAnOrdinaryOneDoesNot()
    {
        using var browser = Browser();

        var silent = await StartAsync(browser, SilentLogin);
        var ordinary = await StartAsync(browser, "/api/auth/login?returnTo=%2F");

        Assert.Equal("none", silent["prompt"]);
        Assert.Equal("fr", silent["ui_locales"]);
        Assert.NotEmpty(silent["code_challenge"]);
        Assert.False(ordinary.ContainsKey("prompt"));
    }

    [Fact]
    public async Task SilentLogin_WithASynapseSession_SignsInAndReturnsWhereTheVisitorWas()
    {
        using var browser = Browser();
        var query = await StartAsync(browser, SilentLogin);
        factory.Identity.Nonce = query["nonce"];
        factory.Identity.NextIdentity = new Dictionary<string, object>
        {
            ["sub"] = Guid.NewGuid().ToString(),
            ["preferred_username"] = "silent_ada",
            ["email"] = "silent_ada@example.test",
            ["sid"] = "sid-silent",
        };

        using var callback = await browser.GetAsync(
            $"/api/auth/callback?code=the-code&state={Uri.EscapeDataString(query["state"])}",
            Cancellation);

        Assert.Equal("/decks/42", callback.Headers.Location!.OriginalString);
        Assert.Null(SilentCookie(callback));
        var session = await factory.ClientWithSession(callback.SessionToken()!)
            .GetFromJsonAsync<AuthUserResponse>("/api/auth/session", Cancellation);
        Assert.Equal("silent_ada", session!.Username);
    }

    [Theory]
    [InlineData("login_required")]
    [InlineData("interaction_required")]
    [InlineData("consent_required")]
    public async Task SilentLogin_WithoutASynapseSession_ReturnsToTheScreen_AndRemembersItTried(string error)
    {
        using var browser = Browser();
        var query = await StartAsync(browser, SilentLogin);
        var exchanges = factory.Identity.TokenRequests.Count;

        using var callback = await ComeBackWithErrorAsync(browser, query["state"], error);

        Assert.Equal("/decks/42?signIn=none", callback.Headers.Location!.OriginalString);
        Assert.Null(callback.SessionToken());
        Assert.Equal(exchanges, factory.Identity.TokenRequests.Count);
        var cookie = SilentCookie(callback);
        Assert.NotNull(cookie);
        Assert.Contains("path=/api/auth", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("max-age=600", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task SilentLogin_ThatFailsOtherwise_ReturnsQuietly_WithoutTheCookie()
    {
        using var browser = Browser();
        var query = await StartAsync(browser, SilentLogin);

        using var callback = await ComeBackWithErrorAsync(browser, query["state"], "server_error");

        Assert.Equal("/decks/42?signIn=none", callback.Headers.Location!.OriginalString);
        Assert.Null(SilentCookie(callback));
        Assert.Null(callback.SessionToken());
    }

    [Fact]
    public async Task SilentLogin_AfterAFailedTry_SkipsTheIdentityService_ButAnOrdinaryLoginDoesNot()
    {
        using var browser = Browser(handleCookies: false);
        browser.DefaultRequestHeaders.Add("Cookie", $"{SilentSignIn.CookieName}=silent-tried");

        using var silent = await browser.GetAsync(SilentLogin, Cancellation);
        var ordinary = await StartAsync(browser, "/api/auth/login?returnTo=%2F");

        Assert.Equal(HttpStatusCode.Redirect, silent.StatusCode);
        Assert.Equal("/decks/42?signIn=none", silent.Headers.Location!.OriginalString);
        Assert.False(ordinary.ContainsKey("prompt"));
    }

    [Fact]
    public async Task SilentLogin_WhenTheIdentityServiceIsDown_ReturnsToTheScreen_InsteadOfAnError()
    {
        using var browser = Browser();
        factory.Identity.Reachable = false;
        try
        {
            using var silent = await browser.GetAsync(SilentLogin, Cancellation);

            Assert.Equal(HttpStatusCode.Redirect, silent.StatusCode);
            Assert.Equal("/decks/42?signIn=none", silent.Headers.Location!.OriginalString);
            // Down is not "no session": the next arrival tries again.
            Assert.Null(SilentCookie(silent));
        }
        finally
        {
            factory.Identity.Reachable = true;
        }
    }

    [Theory]
    [InlineData("https%3A%2F%2Fevil.example%2F")]
    [InlineData("%2F%2Fevil.example")]
    [InlineData("%2Fapi%2Fdecks")]
    public async Task SilentLogin_NeverFallsBackToAnotherSite(string returnTo)
    {
        using var browser = Browser(handleCookies: false);
        browser.DefaultRequestHeaders.Add("Cookie", $"{SilentSignIn.CookieName}=silent-tried");

        using var silent = await browser.GetAsync($"/api/auth/login?silent=true&returnTo={returnTo}", Cancellation);

        Assert.Equal("/?signIn=none", silent.Headers.Location!.OriginalString);
    }
}
