using Microsoft.AspNetCore.WebUtilities;

namespace Erudi.Api.Auth;

/// <summary>
/// Signing in on arrival without showing anything (OpenID Connect <c>prompt=none</c>): someone
/// already signed in to another Synapse app comes back signed in, anyone else lands on the
/// screen they asked for with <c>?signIn=none</c>, which the app never sends back here.
/// </summary>
public sealed class SilentSignIn(IHostEnvironment environment)
{
    /// <summary>The authentication property marking a silent attempt, read when it comes back.</summary>
    public const string Item = "silent";

    /// <summary>
    /// Set once a silent attempt found no Synapse session, so the next arrivals skip the
    /// identity service for a while. A sign-in cookie, within the 15 minutes the terms allow.
    /// </summary>
    public const string CookieName = "erudi_sign_in";

    public static readonly TimeSpan CookieLifetime = TimeSpan.FromMinutes(10);

    private const string Tried = "silent-tried";

    /// <summary>The identity service answers these when it would have to show a page.</summary>
    private static readonly string[] InteractionErrors =
        ["login_required", "interaction_required", "consent_required", "account_selection_required"];

    public static bool WasTried(HttpRequest request) => request.Cookies[CookieName] == Tried;

    public static bool IsSilent(IDictionary<string, string?>? items) =>
        items is not null && items.TryGetValue(Item, out var value) && value == "true";

    public static bool NeedsInteraction(Exception? failure) =>
        failure?.Message is { } message
        && InteractionErrors.Any(error => message.Contains($"'{error}'", StringComparison.Ordinal));

    /// <summary>The screen the visitor asked for, told that the silent attempt is over.</summary>
    public static string FallbackPath(string? returnTo) =>
        QueryHelpers.AddQueryString(ReturnPath.Safe(returnTo), "signIn", "none");

    public void MarkTried(HttpResponse response) =>
        response.Cookies.Append(CookieName, Tried, new CookieOptions
        {
            HttpOnly = true,
            // Only the sign-in endpoint reads it.
            Path = "/api/auth",
            SameSite = SameSiteMode.Lax,
            Secure = !environment.IsDevelopment(),
            IsEssential = true,
            MaxAge = CookieLifetime,
        });
}
