namespace Erudi.Api.Mail;

public sealed record OutgoingMail(string To, string Subject, string TextBody, string HtmlBody);

/// <summary>Hands e-mails to a background sender, so requests never wait on SMTP.</summary>
public interface IMailQueue
{
    /// <summary><c>false</c> when no SMTP server is configured: nothing would be sent.</summary>
    bool Enabled { get; }

    void Enqueue(OutgoingMail mail);
}

public interface IMailSender
{
    Task SendAsync(OutgoingMail mail, CancellationToken cancellationToken);
}
