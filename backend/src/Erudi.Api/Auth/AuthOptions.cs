using System.ComponentModel.DataAnnotations;

namespace Erudi.Api.Auth;

public sealed class AuthOptions
{
    public const string Section = "Auth";

    [Range(1, 365)]
    public int SessionTtlDays { get; set; } = 30;

    /// <summary>Attempts per minute and client IP on sign-up, sign-in and password recovery.</summary>
    [Range(1, 100_000)]
    public int RateLimitPerMinute { get; set; } = 10;
}
