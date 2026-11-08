namespace Erudi.Api.Users;

/// <summary>
/// A learner. The account itself lives on the Synapse identity service: the id is its
/// subject, and the username and e-mail are copies refreshed at each sign-in.
/// </summary>
public sealed class User
{
    public Guid Id { get; init; }

    /// <summary>As the account has it, for display (shown on published decks).</summary>
    public string Username { get; set; } = "";

    public string NormalizedUsername { get; set; } = "";

    public string Email { get; set; } = "";

    public string NormalizedEmail { get; set; } = "";

    /// <summary>When Erudi's own terms were accepted; null until the first screen asks.</summary>
    public DateTimeOffset? TermsAcceptedAt { get; set; }

    public string Locale { get; set; } = UserRules.DefaultLocale;

    public DateTimeOffset CreatedAt { get; init; }
}
