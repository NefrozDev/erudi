using System.Net;
using System.Net.Http.Json;
using Erudi.Api.Auth.Contracts;
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
        using var client = factory.CreateClient();
        var account = TestAccounts.New();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/register") { Content = JsonContent.Create(account) };
        request.Headers.Add(header, value);

        using var response = await client.SendAsync(request, Cancellation);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Null(response.SessionToken());
        var normalizedEmail = account.Email.ToLowerInvariant();
        Assert.False(await factory.QueryAsync(db => db.Users.AnyAsync(u => u.NormalizedEmail == normalizedEmail, Cancellation)));
    }

    [Theory]
    [InlineData("Origin", "http://localhost:4200")]
    [InlineData("Referer", "http://localhost:4200/sign-up")]
    public async Task StateChangingRequestFromTheApp_IsAccepted(string header, string value)
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/register") { Content = JsonContent.Create(TestAccounts.New()) };
        request.Headers.Add(header, value);

        using var response = await client.SendAsync(request, Cancellation);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
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
    public async Task AuthEndpoints_AreRateLimitedPerClient()
    {
        using var limitedFactory = factory.WithWebHostBuilder(host => host.ConfigureAppConfiguration((_, configuration) =>
            configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Auth:RateLimitPerMinute"] = "2" })));
        using var client = limitedFactory.CreateClient();
        var attempt = new LoginRequest { Email = "nobody@example.test", Password = "whatever123" };

        using var first = await client.PostAsJsonAsync("/api/auth/login", attempt, Cancellation);
        using var second = await client.PostAsJsonAsync("/api/auth/login", attempt, Cancellation);
        // The limit is shared by every auth endpoint.
        using var third = await client.PostAsJsonAsync("/api/auth/register", TestAccounts.New(), Cancellation);
        using var unlimited = await client.GetAsync("/api/auth/session", Cancellation);

        Assert.Equal(HttpStatusCode.Unauthorized, first.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, second.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unlimited.StatusCode);
    }
}
