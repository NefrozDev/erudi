using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Erudi.Api.Users;
using Erudi.Api.Validation;

namespace Erudi.Api.Auth.Contracts;

// Defaults are empty strings rather than `required` members: a missing field then gets a
// validation error on that field instead of a JSON deserialization error.

public sealed class RegisterRequest
{
    [Required, RegularExpression(UserRules.UsernamePattern)]
    public string Username { get; init; } = "";

    [Required, EmailAddress, StringLength(UserRules.EmailMaxLength)]
    public string Email { get; init; } = "";

    [Required, StringLength(UserRules.PasswordMaxLength, MinimumLength = UserRules.PasswordMinLength)]
    public string Password { get; init; } = "";

    [MustBeTrue]
    public bool AcceptedTerms { get; init; }
}

public sealed class LoginRequest
{
    [Required, StringLength(UserRules.EmailMaxLength)]
    public string Email { get; init; } = "";

    [Required, StringLength(UserRules.PasswordMaxLength)]
    public string Password { get; init; } = "";
}

public sealed class PasswordResetRequest
{
    [Required, EmailAddress, StringLength(UserRules.EmailMaxLength)]
    public string Email { get; init; } = "";
}

public sealed class PasswordResetConfirmation
{
    [Required, RegularExpression(SecureTokens.Pattern)]
    public string Token { get; init; } = "";

    [Required, StringLength(UserRules.PasswordMaxLength, MinimumLength = UserRules.PasswordMinLength)]
    public string Password { get; init; } = "";
}

public sealed record AuthUserResponse(Guid Id, string Username, string Email)
{
    public static AuthUserResponse From(User user) => new(user.Id, user.Username, user.Email);

    /// <summary>Reads the claims set by <see cref="SessionAuthenticationHandler"/>.</summary>
    public static AuthUserResponse From(ClaimsPrincipal principal) => new(
        principal.GetUserId(),
        principal.FindFirstValue(ClaimTypes.Name) ?? "",
        principal.FindFirstValue(ClaimTypes.Email) ?? "");
}
