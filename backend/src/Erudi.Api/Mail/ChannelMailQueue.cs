using System.Threading.Channels;
using Microsoft.Extensions.Options;

namespace Erudi.Api.Mail;

/// <summary>
/// An in-memory queue drained by <see cref="MailDispatcher"/>. A Channel is a thread-safe
/// producer/consumer queue: requests write to it, the background service reads from it.
/// </summary>
public sealed class ChannelMailQueue(IOptions<SmtpOptions> options, ILogger<ChannelMailQueue> logger) : IMailQueue
{
    // Bounded so a flood of requests cannot grow memory without limit.
    private const int Capacity = 100;

    private readonly Channel<OutgoingMail> channel = Channel.CreateBounded<OutgoingMail>(
        new BoundedChannelOptions(Capacity) { SingleReader = true });

    public bool Enabled => options.Value.Enabled;

    public ChannelReader<OutgoingMail> Reader => channel.Reader;

    public void Enqueue(OutgoingMail mail)
    {
        if (!channel.Writer.TryWrite(mail))
        {
            logger.LogWarning("The mail queue is full: \"{Subject}\" was dropped.", mail.Subject);
        }
    }
}
