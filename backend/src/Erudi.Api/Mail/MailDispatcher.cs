namespace Erudi.Api.Mail;

/// <summary>
/// Sends queued e-mails one by one for the lifetime of the app. A failure is logged and
/// never stops the loop, so one bad address cannot block the next e-mails.
/// </summary>
public sealed class MailDispatcher(ChannelMailQueue queue, IMailSender sender, ILogger<MailDispatcher> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var mail in queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await sender.SendAsync(mail, stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogError(exception, "Sending \"{Subject}\" failed.", mail.Subject);
            }
        }
    }
}
