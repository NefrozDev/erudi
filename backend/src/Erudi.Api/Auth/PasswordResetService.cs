using Erudi.Api.Data;
using Erudi.Api.Mail;
using Erudi.Api.Security;
using Erudi.Api.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Erudi.Api.Auth;

/// <summary>
/// Password recovery by e-mail. Asking never says whether the address has an account; the
/// link carries a single-use token valid for <see cref="Validity"/>, and using it signs the
/// account out everywhere.
/// </summary>
public sealed class PasswordResetService(
    ErudiDbContext db,
    PasswordService passwords,
    IMailQueue mail,
    TimeProvider clock,
    IOptions<FrontendOptions> frontend,
    IHostEnvironment environment,
    ILogger<PasswordResetService> logger)
{
    public static readonly TimeSpan Validity = TimeSpan.FromMinutes(30);

    /// <summary>
    /// Returns once the token is stored. The e-mail leaves from a background queue, so an
    /// existing address does not answer measurably later than an unknown one.
    /// </summary>
    public async Task RequestAsync(string email, CancellationToken cancellationToken)
    {
        var normalizedEmail = UserRules.Normalize(email);
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.NormalizedEmail == normalizedEmail, cancellationToken);
        if (user is null)
        {
            return;
        }

        var now = clock.GetUtcNow();
        var token = SecureTokens.Create();

        await using (var transaction = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            // Only the latest link works; everyone's expired links are cleaned on the way.
            await db.PasswordResets
                .Where(r => r.UserId == user.Id || r.ExpiresAt <= now)
                .ExecuteDeleteAsync(cancellationToken);
            db.PasswordResets.Add(new PasswordReset
            {
                Id = Guid.CreateVersion7(now),
                UserId = user.Id,
                TokenHash = SecureTokens.Hash(token),
                ExpiresAt = now + Validity,
                CreatedAt = now,
            });
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        // A URL fragment never reaches a server, so proxies and access logs cannot record the token.
        var link = $"{frontend.Value.Url.TrimEnd('/')}/reset-password#token={token}";

        if (mail.Enabled)
        {
            mail.Enqueue(PasswordResetMail.Create(user, link, Validity));
        }
        else if (environment.IsDevelopment())
        {
            // Without SMTP, the logged link is the only way to try the flow locally.
            logger.LogInformation("Password reset link for {Username}: {Link}", user.Username, link);
        }
        else
        {
            logger.LogWarning("Password reset asked for {Username}, but no SMTP server is configured.", user.Username);
        }
    }

    /// <returns><c>false</c> when the link is unknown, expired or already used.</returns>
    public async Task<bool> ConfirmAsync(string token, string newPassword, CancellationToken cancellationToken)
    {
        var tokenHash = SecureTokens.Hash(token);
        var reset = await db.PasswordResets
            .Include(r => r.User)
            .SingleOrDefaultAsync(r => r.TokenHash == tokenHash, cancellationToken);

        if (reset is null || reset.ExpiresAt <= clock.GetUtcNow())
        {
            return false;
        }

        // Hashing is deliberately slow: done before the transaction holds any lock.
        var passwordHash = passwords.Hash(reset.User, newPassword);

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        // Claiming the row first makes the link single-use, even on a double click: the
        // second request waits for the first one's commit, then deletes nothing.
        var claimed = await db.PasswordResets.Where(r => r.Id == reset.Id).ExecuteDeleteAsync(cancellationToken);
        if (claimed == 0)
        {
            return false;
        }

        reset.User.PasswordHash = passwordHash;
        await db.SaveChangesAsync(cancellationToken);
        await db.PasswordResets.Where(r => r.UserId == reset.UserId).ExecuteDeleteAsync(cancellationToken);
        await db.Sessions.Where(s => s.UserId == reset.UserId).ExecuteDeleteAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return true;
    }
}
