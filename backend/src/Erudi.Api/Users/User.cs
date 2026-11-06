namespace Erudi.Api.Users;

public sealed class User
{
    public Guid Id { get; init; }

    /// <summary>As typed at sign-up, for display.</summary>
    public string Username { get; set; } = "";

    public string NormalizedUsername { get; set; } = "";

    public string Email { get; set; } = "";

    public string NormalizedEmail { get; set; } = "";

    public string PasswordHash { get; set; } = "";

    public DateTimeOffset TermsAcceptedAt { get; set; }

    public string Locale { get; set; } = UserRules.DefaultLocale;

    public DateTimeOffset CreatedAt { get; init; }
}
