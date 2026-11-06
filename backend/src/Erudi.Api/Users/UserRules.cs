namespace Erudi.Api.Users;

/// <summary>Account rules shared by validation, persistence and the services.</summary>
public static class UserRules
{
    /// <summary>The pseudo shown on published decks, with Plano's rules.</summary>
    public const string UsernamePattern = "^[a-zA-Z0-9._-]{3,30}$";
    public const int UsernameMaxLength = 30;
    public const int EmailMaxLength = 254;
    public const int PasswordMinLength = 8;
    public const int PasswordMaxLength = 128;
    public const int LocaleMaxLength = 8;
    public const string DefaultLocale = "fr";

    /// <summary>Usernames and e-mails are unique case-insensitively: they are compared in this form.</summary>
    public static string Normalize(string value) => value.Trim().ToLowerInvariant();
}
