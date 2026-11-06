using System.Threading.Channels;
using Erudi.Api.Auth;
using Erudi.Api.Mail;
using Erudi.Api.Users;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Erudi.Api.Tests.Mail;

public sealed class MailTests
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("", false)]
    [InlineData("  ", false)]
    [InlineData("mail.example.test", true)]
    public void Queue_IsEnabledOnlyWithAnSmtpHost(string host, bool enabled)
    {
        var queue = new ChannelMailQueue(Options.Create(new SmtpOptions { Host = host }), NullLogger<ChannelMailQueue>.Instance);

        Assert.Equal(enabled, queue.Enabled);
    }

    [Fact]
    public void Queue_DropsMailsOnceFullInsteadOfGrowing()
    {
        var queue = new ChannelMailQueue(Options.Create(new SmtpOptions()), NullLogger<ChannelMailQueue>.Instance);

        for (var i = 0; i < 101; i++)
        {
            queue.Enqueue(Mail(i));
        }

        Assert.Equal(100, queue.Reader.Count);
    }

    [Fact]
    public async Task Dispatcher_SendsInOrderAndKeepsGoingAfterAFailure()
    {
        var queue = new ChannelMailQueue(Options.Create(new SmtpOptions()), NullLogger<ChannelMailQueue>.Instance);
        var sender = new FakeSender(failOn: "Mail 1");
        using var dispatcher = new MailDispatcher(queue, sender, NullLogger<MailDispatcher>.Instance);
        await dispatcher.StartAsync(Cancellation);

        queue.Enqueue(Mail(0));
        queue.Enqueue(Mail(1));
        queue.Enqueue(Mail(2));
        var attempted = await sender.WaitForAsync(3);
        await dispatcher.StopAsync(Cancellation);

        Assert.Equal(["Mail 0", "Mail 1", "Mail 2"], attempted);
    }

    [Fact]
    public void SmtpMessage_CarriesBothBodiesAndTheAddresses()
    {
        using var message = SmtpMailSender.BuildMessage(Mail(7), "Erudi <no-reply@example.test>");

        var from = Assert.Single(message.From.Mailboxes);
        Assert.Equal("Erudi", from.Name);
        Assert.Equal("no-reply@example.test", from.Address);
        Assert.Equal("someone@example.test", Assert.Single(message.To.Mailboxes).Address);
        Assert.Equal("Mail 7", message.Subject);
        Assert.Equal("Text 7", message.TextBody?.Trim());
        Assert.Equal("<p>Html 7</p>", message.HtmlBody?.Trim());
    }

    [Fact]
    public void PasswordResetMail_IsAddressedToTheUserAndEncodesTheLinkInHtml()
    {
        var user = new User { Username = "chloe", Email = "chloe@example.test" };

        var mail = PasswordResetMail.Create(user, "https://erudi.test/reset-password#token=a&b", TimeSpan.FromMinutes(30));

        Assert.Equal("chloe@example.test", mail.To);
        Assert.Contains("Bonjour chloe", mail.TextBody, StringComparison.Ordinal);
        Assert.Contains("https://erudi.test/reset-password#token=a&b", mail.TextBody, StringComparison.Ordinal);
        Assert.Contains("30 minutes", mail.TextBody, StringComparison.Ordinal);
        Assert.Contains("token=a&amp;b", mail.HtmlBody, StringComparison.Ordinal);
    }

    private static OutgoingMail Mail(int index) =>
        new("someone@example.test", $"Mail {index}", $"Text {index}", $"<p>Html {index}</p>");

    private sealed class FakeSender(string failOn) : IMailSender
    {
        private readonly Channel<string> attempts = Channel.CreateUnbounded<string>();

        public async Task SendAsync(OutgoingMail mail, CancellationToken cancellationToken)
        {
            await attempts.Writer.WriteAsync(mail.Subject, cancellationToken);
            if (mail.Subject == failOn)
            {
                throw new InvalidOperationException("SMTP is down.");
            }
        }

        public async Task<List<string>> WaitForAsync(int count)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(Cancellation);
            timeout.CancelAfter(TimeSpan.FromSeconds(5));
            var received = new List<string>();
            while (received.Count < count)
            {
                received.Add(await attempts.Reader.ReadAsync(timeout.Token));
            }

            return received;
        }
    }
}
