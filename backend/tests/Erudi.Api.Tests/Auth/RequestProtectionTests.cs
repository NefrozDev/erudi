using System.Net;
using Erudi.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Erudi.Api.Tests.Auth;

/// <summary>Cross-site request refusal and rate limiting.</summary>
public sealed class RequestProtectionTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("Origin", "https://evil.example")]
    [InlineData("Origin", "null")]
    [InlineData("Origin", "http://localhost:4201")]
    [InlineData("Referer", "https://evil.example/page")]
    public async Task StateChangingRequestFromAnotherSite_IsRefused(string header, string value)
    {
        var session = await factory.SignInDirectlyAsync(TestAccounts.NewIdentity());
        using var client = factory.CreateClientWithoutCookies();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/account/terms").WithSession(session.Token);
        request.Headers.Add(header, value);

        using var response = await client.SendAsync(request, Cancellation);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Null(await factory.QueryAsync(db => db.Users
            .Where(u => u.Id == session.User.Id)
            .Select(u => u.TermsAcceptedAt)
            .SingleAsync(Cancellation)));
    }

    [Theory]
    [InlineData("Origin", "http://localhost:4200")]
    [InlineData("Referer", "http://localhost:4200/accept-terms")]
    public async Task StateChangingRequestFromTheApp_IsAccepted(string header, string value)
    {
        var session = await factory.SignInDirectlyAsync(TestAccounts.NewIdentity());
        using var client = factory.CreateClientWithoutCookies();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/account/terms").WithSession(session.Token);
        request.Headers.Add(header, value);

        using var response = await client.SendAsync(request, Cancellation);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task ReadingFromAnotherSite_IsNotBlockedByTheOriginCheck()
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/health");
        request.Headers.Add("Origin", "https://evil.example");

        using var response = await client.SendAsync(request, Cancellation);

        // Browsers still cannot read the answer: the API sends no CORS headers.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task SignIn_IsRateLimitedPerClient()
    {
        using var limitedFactory = factory.WithWebHostBuilder(host => host.ConfigureAppConfiguration((_, configuration) =>
            configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Auth:RateLimitPerMinute"] = "2" })));
        using var client = limitedFactory.CreateClient(new() { AllowAutoRedirect = false });

        using var first = await client.GetAsync("/api/auth/login", Cancellation);
        using var second = await client.GetAsync("/api/auth/login", Cancellation);
        using var third = await client.GetAsync("/api/auth/login", Cancellation);
        using var unlimited = await client.GetAsync("/api/auth/session", Cancellation);

        Assert.Equal(HttpStatusCode.Redirect, first.StatusCode);
        Assert.Equal(HttpStatusCode.Redirect, second.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unlimited.StatusCode);
    }
}
