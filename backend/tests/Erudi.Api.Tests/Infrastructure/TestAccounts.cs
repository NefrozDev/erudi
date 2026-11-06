using System.Net.Http.Json;
using Erudi.Api.Auth;
using Erudi.Api.Auth.Contracts;

namespace Erudi.Api.Tests.Infrastructure;

internal static class TestAccounts
{
    public const string Password = "correct horse battery";

    /// <summary>A new, unique account, so tests sharing a database never collide.</summary>
    public static RegisterRequest New()
    {
        var id = Guid.NewGuid().ToString("N")[..12];
        return new RegisterRequest
        {
            Username = $"User_{id}",
            Email = $"Someone.{id}@Example.test",
            Password = Password,
            AcceptedTerms = true,
        };
    }

    public static async Task<AuthUserResponse> RegisterAsync(this HttpClient client, RegisterRequest account)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/register", account, TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthUserResponse>(TestContext.Current.CancellationToken))!;
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
