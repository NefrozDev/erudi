using Erudi.Api.Users;

namespace Erudi.Api.Auth;

/// <summary>A pending password recovery. Only the SHA-256 of the e-mailed token is stored.</summary>
public sealed class PasswordReset
{
    public Guid Id { get; init; }

    public Guid UserId { get; init; }

    public User User { get; init; } = null!;

    public string TokenHash { get; init; } = "";

    public DateTimeOffset ExpiresAt { get; init; }

    public DateTimeOffset CreatedAt { get; init; }
}
