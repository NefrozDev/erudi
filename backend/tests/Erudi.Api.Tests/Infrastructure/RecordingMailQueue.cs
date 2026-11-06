using System.Collections.Concurrent;
using Erudi.Api.Mail;

namespace Erudi.Api.Tests.Infrastructure;

public sealed class RecordingMailQueue : IMailQueue
{
    private readonly ConcurrentQueue<OutgoingMail> queued = new();

    public bool Enabled { get; set; } = true;

    public IReadOnlyList<OutgoingMail> SentTo(string address) =>
        [.. queued.Where(m => string.Equals(m.To, address, StringComparison.OrdinalIgnoreCase))];

    public void Enqueue(OutgoingMail mail) => queued.Enqueue(mail);
}
