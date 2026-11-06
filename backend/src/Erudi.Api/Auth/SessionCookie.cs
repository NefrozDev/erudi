namespace Erudi.Api.Auth;

/// <summary>
/// The HttpOnly cookie carrying the session token: scripts, including an injected one,
/// cannot read it.
/// </summary>
public sealed class SessionCookie(IHostEnvironment environment)
{
    public const string Name = "erudi_session";

    public static string? Read(HttpRequest request) => request.Cookies[Name];

    public void Append(HttpResponse response, IssuedSession session) =>
        response.Cookies.Append(Name, session.Token, Options(session.ExpiresAt));

    public void Delete(HttpResponse response) => response.Cookies.Delete(Name, Options(expires: null));

    private CookieOptions Options(DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        // Every API route is under /api: the browser never sends the cookie with pages or assets.
        Path = "/api",
        // Lax still sends it when following a link to the app, but not with cross-site POSTs.
        SameSite = SameSiteMode.Lax,
        // The local dev server runs on plain HTTP.
        Secure = !environment.IsDevelopment(),
        IsEssential = true,
        Expires = expires,
    };
}
