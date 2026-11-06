using Erudi.Api.Users;

namespace Erudi.Api.Auth;

/// <summary>A signed-in device. Only the SHA-256 of the cookie token is stored.</summary>
public sealed class Session
{
    public Guid Id { get; init; }

    public string TokenHash { get; init; } = "";

    public Guid UserId { get; init; }

    public User User { get; init; } = null!;

    public DateTimeOffset ExpiresAt { get; init; }

    public DateTimeOffset CreatedAt { get; init; }
}
