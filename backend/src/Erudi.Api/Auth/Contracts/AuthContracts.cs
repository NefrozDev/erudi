using System.Security.Claims;
using Erudi.Api.Users;

namespace Erudi.Api.Auth.Contracts;

/// <param name="TermsAccepted">False until Erudi's own terms are accepted on its first screen.</param>
public sealed record AuthUserResponse(Guid Id, string Username, string Email, bool TermsAccepted)
{
    public static AuthUserResponse From(User user) =>
        new(user.Id, user.Username, user.Email, user.TermsAcceptedAt is not null);

    /// <summary>Reads the claims set by <see cref="SessionAuthenticationHandler"/>.</summary>
    public static AuthUserResponse From(ClaimsPrincipal principal) => new(
        principal.GetUserId(),
        principal.FindFirstValue(ClaimTypes.Name) ?? "",
        principal.FindFirstValue(ClaimTypes.Email) ?? "",
        principal.FindFirstValue(SessionAuthenticationHandler.TermsAcceptedClaim) == "true");
}

/// <summary>Where to send the browser next: the identity service, to sign out everywhere.</summary>
public sealed record SignOutResponse(string RedirectTo);
