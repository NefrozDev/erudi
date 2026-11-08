using Erudi.Api.Auth;
using Microsoft.Extensions.DependencyInjection;

namespace Erudi.Api.Tests.Infrastructure;

internal static class TestAccounts
{
    /// <summary>A new, unique person as the identity service would describe them.</summary>
    public static IdentityClaims NewIdentity(string? sessionId = null)
    {
        var id = Guid.NewGuid().ToString("N")[..12];
        return new IdentityClaims(Guid.NewGuid(), $"User_{id}", $"Someone.{id}@Example.test", "fr", sessionId);
    }

    /// <summary>Opens a session as a completed sign-in would, without the round trip.</summary>
    public static async Task<IssuedSession> SignInDirectlyAsync(this ErudiApiFactory factory, IdentityClaims identity)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<AuthService>()
            .SignInAsync(identity, TestContext.Current.CancellationToken);
    }

    /// <summary>A client carrying the session cookie on every request.</summary>
    public static HttpClient ClientWithSession(this ErudiApiFactory factory, string token)
    {
        var client = factory.CreateClientWithoutCookies();
        client.DefaultRequestHeaders.Add("Cookie", $"{SessionCookie.Name}={token}");
        return client;
    }

    /// <summary>The session token from a response's Set-Cookie header.</summary>
    public static string? SessionToken(this HttpResponseMessage response)
    {
        if (!response.Headers.TryGetValues("Set-Cookie", out var cookies))
        {
            return null;
        }

        var prefix = $"{SessionCookie.Name}=";
        var cookie = cookies.SingleOrDefault(c => c.StartsWith(prefix, StringComparison.Ordinal));
        return cookie?[prefix.Length..cookie.IndexOf(';', StringComparison.Ordinal)];
    }

    public static HttpRequestMessage WithSession(this HttpRequestMessage request, string token)
    {
        request.Headers.Add("Cookie", $"{SessionCookie.Name}={token}");
        return request;
    }
}
