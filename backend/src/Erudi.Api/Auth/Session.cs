using Erudi.Api.Users;

namespace Erudi.Api.Auth;

/// <summary>A signed-in device. Only the SHA-256 of the cookie token is stored.</summary>
public sealed class Session
{
    public const int OidcSidMaxLength = 255;

    public Guid Id { get; init; }

    public string TokenHash { get; init; } = "";

    public Guid UserId { get; init; }

    public User User { get; init; } = null!;

    /// <summary>
    /// The Synapse identity session this one was opened from: a back-channel logout names it.
    /// </summary>
    public string? OidcSid { get; init; }

    public DateTimeOffset ExpiresAt { get; init; }

    public DateTimeOffset CreatedAt { get; init; }
}
