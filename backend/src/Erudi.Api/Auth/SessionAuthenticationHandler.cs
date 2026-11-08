using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Erudi.Api.Auth;

/// <summary>
/// Turns the session cookie into <c>HttpContext.User</c> on every request, so controllers
/// only need <c>[Authorize]</c>. An unknown or expired session leaves the request anonymous,
/// and <c>[Authorize]</c> then answers 401.
/// </summary>
public sealed class SessionAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    AuthService auth)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    /// <summary>"true" once the learner accepted Erudi's own terms.</summary>
    public const string TermsAcceptedClaim = "erudi:terms_accepted";

    public const string SchemeName = "Session";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var token = SessionCookie.Read(Request);
        if (token is null)
        {
            return AuthenticateResult.NoResult();
        }

        var user = await auth.FindSessionUserAsync(token, Context.RequestAborted);
        if (user is null)
        {
            return AuthenticateResult.Fail("Invalid or expired session.");
        }

        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(TermsAcceptedClaim, user.TermsAcceptedAt is null ? "false" : "true"),
            ],
            SchemeName);

        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }
}

public static class ClaimsPrincipalExtensions
{
    /// <summary>The signed-in user's id. Only call it behind <c>[Authorize]</c>.</summary>
    public static Guid GetUserId(this ClaimsPrincipal principal) =>
        Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new InvalidOperationException("The request is not authenticated."));
}
