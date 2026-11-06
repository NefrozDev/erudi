namespace Erudi.Api.Mail;

public sealed class SmtpOptions
{
    public const string Section = "Smtp";

    /// <summary>Empty: no e-mail is sent.</summary>
    public string Host { get; set; } = "";

    /// <summary>465 is implicit TLS (SMTPS); any other port upgrades with STARTTLS.</summary>
    public int Port { get; set; } = 465;

    public string User { get; set; } = "";

    public string Password { get; set; } = "";

    /// <summary>For example <c>Erudi &lt;no-reply@synapseengineering.dev&gt;</c>.</summary>
    public string From { get; set; } = "";

    public bool Enabled => !string.IsNullOrWhiteSpace(Host);
}
