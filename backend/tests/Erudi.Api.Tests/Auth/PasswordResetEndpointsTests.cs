using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Erudi.Api.Auth;
using Erudi.Api.Auth.Contracts;
using Erudi.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Tests.Auth;

public sealed partial class PasswordResetEndpointsTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    private const string NewPassword = "a brand new password";

    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Request_ForAnUnknownAddress_AnswersTheSameButSendsNothing()
    {
        using var client = factory.CreateClient();
        var address = $"nobody.{Guid.NewGuid():N}@example.test";
        var resetsBefore = await factory.QueryAsync(db => db.PasswordResets.CountAsync(Cancellation));

        using var response = await client.PostAsJsonAsync("/api/auth/password-reset", new PasswordResetRequest { Email = address }, Cancellation);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(factory.Mail.SentTo(address));
        Assert.Equal(resetsBefore, await factory.QueryAsync(db => db.PasswordResets.CountAsync(Cancellation)));
    }

    [Fact]
    public async Task Request_ForAnAccount_MailsALinkWhoseTokenIsStoredHashed()
    {
        using var client = factory.CreateClient();
        var account = TestAccounts.New();
        var user = await client.RegisterAsync(account);

        using var response = await client.PostAsJsonAsync(
            "/api/auth/password-reset", new PasswordResetRequest { Email = account.Email.ToUpperInvariant() }, Cancellation);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var mail = Assert.Single(factory.Mail.SentTo(account.Email));
        Assert.Equal("Ton nouveau mot de passe Erudi", mail.Subject);
        Assert.Contains("http://localhost:4200/reset-password#token=", mail.TextBody, StringComparison.Ordinal);
        Assert.Contains("30 minutes", mail.TextBody, StringComparison.Ordinal);
        var token = TokenIn(mail.TextBody);
        Assert.Contains(token, mail.HtmlBody, StringComparison.Ordinal);

        var reset = await factory.QueryAsync(db => db.PasswordResets.SingleAsync(r => r.UserId == user.Id, Cancellation));
        Assert.Equal(SecureTokens.Hash(token), reset.TokenHash);
        Assert.Equal(factory.Clock.GetUtcNow().AddMinutes(30), reset.ExpiresAt);
    }

    [Fact]
    public async Task Request_WithoutSmtp_StoresTheLinkButQueuesNoMail()
    {
        using var client = factory.CreateClient();
        var account = TestAccounts.New();
        var user = await client.RegisterAsync(account);
        factory.Mail.Enabled = false;

        try
        {
            using var response = await client.PostAsJsonAsync(
                "/api/auth/password-reset", new PasswordResetRequest { Email = account.Email }, Cancellation);

            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
            Assert.Empty(factory.Mail.SentTo(account.Email));
            Assert.True(await factory.QueryAsync(db => db.PasswordResets.AnyAsync(r => r.UserId == user.Id, Cancellation)));
        }
        finally
        {
            factory.Mail.Enabled = true;
        }
    }

    [Fact]
    public async Task Confirm_ChangesThePasswordAndSignsOutEveryDevice()
    {
        using var signedIn = factory.CreateClient();
        var account = TestAccounts.New();
        var user = await signedIn.RegisterAsync(account);
        var token = await RequestResetTokenAsync(account.Email);

        using var client = factory.CreateClient();
        using var response = await ConfirmAsync(client, token, NewPassword);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await signedIn.GetAsync("/api/auth/session", Cancellation)).StatusCode);
        Assert.False(await factory.QueryAsync(db => db.Sessions.AnyAsync(s => s.UserId == user.Id, Cancellation)));
        Assert.False(await factory.QueryAsync(db => db.PasswordResets.AnyAsync(r => r.UserId == user.Id, Cancellation)));
        Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync(client, account.Email, account.Password)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, account.Email, NewPassword)).StatusCode);
    }

    [Fact]
    public async Task Confirm_WorksOnlyOnce()
    {
        var account = TestAccounts.New();
        using var client = factory.CreateClient();
        await client.RegisterAsync(account);
        var token = await RequestResetTokenAsync(account.Email);
        using var first = await ConfirmAsync(client, token, NewPassword);

        using var second = await ConfirmAsync(client, token, "yet another password");

        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        await AssertInvalidLinkAsync(second);
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, account.Email, NewPassword)).StatusCode);
    }

    [Fact]
    public async Task Confirm_AcceptsOnlyTheLatestLink()
    {
        var account = TestAccounts.New();
        using var client = factory.CreateClient();
        await client.RegisterAsync(account);
        var older = await RequestResetTokenAsync(account.Email);
        var latest = await RequestResetTokenAsync(account.Email);

        using var withOlder = await ConfirmAsync(client, older, NewPassword);
        using var withLatest = await ConfirmAsync(client, latest, NewPassword);

        await AssertInvalidLinkAsync(withOlder);
        Assert.Equal(HttpStatusCode.NoContent, withLatest.StatusCode);
    }

    [Fact]
    public async Task Confirm_RefusesAnExpiredLinkAndKeepsThePassword()
    {
        var account = TestAccounts.New();
        using var client = factory.CreateClient();
        await client.RegisterAsync(account);
        var token = await RequestResetTokenAsync(account.Email);
        factory.Clock.Advance(TimeSpan.FromMinutes(30));

        using var response = await ConfirmAsync(client, token, NewPassword);

        await AssertInvalidLinkAsync(response);
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, account.Email, account.Password)).StatusCode);
    }

    [Theory]
    [InlineData("too-short", NewPassword, "token")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "short", "password")]
    public async Task Confirm_ValidatesTheInput(string token, string password, string invalidField)
    {
        using var client = factory.CreateClient();

        using var response = await ConfirmAsync(client, token, password);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(Cancellation);
        Assert.Contains(invalidField, problem!.Errors.Keys);
    }

    private static string TokenIn(string text) => TokenPattern().Match(text).Groups[1].Value;

    [GeneratedRegex("#token=([A-Za-z0-9_-]{43})")]
    private static partial Regex TokenPattern();

    private static Task<HttpResponseMessage> ConfirmAsync(HttpClient client, string token, string password) =>
        client.PostAsJsonAsync(
            "/api/auth/password-reset/confirm",
            new PasswordResetConfirmation { Token = token, Password = password },
            Cancellation);

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client, string email, string password) =>
        client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = email, Password = password }, Cancellation);

    private static async Task AssertInvalidLinkAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>(Cancellation);
        Assert.Equal("Invalid reset link", problem!.Title);
    }

    private async Task<string> RequestResetTokenAsync(string email)
    {
        using var client = factory.CreateClient();
        using var response = await client.PostAsJsonAsync("/api/auth/password-reset", new PasswordResetRequest { Email = email }, Cancellation);
        response.EnsureSuccessStatusCode();
        return TokenIn(factory.Mail.SentTo(email)[^1].TextBody);
    }
}
