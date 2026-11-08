using Erudi.Api.Data;
using Erudi.Api.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Erudi.Api.Auth;

public sealed record IssuedSession(string Token, DateTimeOffset ExpiresAt, User User);

/// <summary>
/// Erudi's own sessions, behind the HttpOnly cookie, opened once the Synapse identity
/// service has signed someone in. The account lives there; Erudi keeps the username and the
/// e-mail as copies refreshed at each sign-in, and the language and its terms as its own.
/// </summary>
public sealed class AuthService(
    ErudiDbContext db,
    TimeProvider clock,
    IOptions<AuthOptions> options)
{
    /// <summary>
    /// Opens a session for the person the identity service vouched for, creating the learner
    /// on a first visit, with the account's id.
    /// </summary>
    public async Task<IssuedSession> SignInAsync(IdentityClaims claims, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        await db.Sessions.Where(s => s.ExpiresAt <= now).ExecuteDeleteAsync(cancellationToken);

        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == claims.Subject, cancellationToken);
        if (user is null)
        {
            user = new User
            {
                Id = claims.Subject,
                Locale = UserRules.LocaleOf(claims.Locale),
                // Erudi's own terms are accepted on its first screen.
                TermsAcceptedAt = null,
                CreatedAt = now,
            };
            db.Users.Add(user);
        }

        user.Username = claims.Username.Trim();
        user.NormalizedUsername = UserRules.Normalize(claims.Username);
        user.Email = claims.Email.Trim();
        user.NormalizedEmail = UserRules.Normalize(claims.Email);

        var token = SecureTokens.Create();
        var expiresAt = now.AddDays(options.Value.SessionTtlDays);
        db.Sessions.Add(new Session
        {
            Id = Guid.CreateVersion7(now),
            TokenHash = SecureTokens.Hash(token),
            UserId = user.Id,
            OidcSid = claims.SessionId,
            ExpiresAt = expiresAt,
            CreatedAt = now,
        });
        await db.SaveChangesAsync(cancellationToken);

        return new IssuedSession(token, expiresAt, user);
    }

    /// <returns>The signed-in user, or <c>null</c> when the token is unknown or expired.</returns>
    public async Task<User?> FindSessionUserAsync(string? token, CancellationToken cancellationToken)
    {
        if (!SecureTokens.HasValidFormat(token))
        {
            return null;
        }

        var tokenHash = SecureTokens.Hash(token);
        var session = await db.Sessions
            .AsNoTracking()
            .Include(s => s.User)
            .SingleOrDefaultAsync(s => s.TokenHash == tokenHash, cancellationToken);

        if (session is null)
        {
            return null;
        }

        if (session.ExpiresAt <= clock.GetUtcNow())
        {
            await db.Sessions.Where(s => s.Id == session.Id).ExecuteDeleteAsync(cancellationToken);
            return null;
        }

        return session.User;
    }

    public async Task LogoutAsync(string? token, CancellationToken cancellationToken)
    {
        if (!SecureTokens.HasValidFormat(token))
        {
            return;
        }

        var tokenHash = SecureTokens.Hash(token);
        await db.Sessions.Where(s => s.TokenHash == tokenHash).ExecuteDeleteAsync(cancellationToken);
    }

    /// <summary>
    /// An identity session ended (back-channel logout): ends the sessions opened from it, or
    /// every session of the account when the token names no session.
    /// </summary>
    public Task<int> EndSessionsAsync(EndedSession ended, CancellationToken cancellationToken) =>
        ended.SessionId is { } sid
            ? db.Sessions.Where(s => s.OidcSid == sid).ExecuteDeleteAsync(cancellationToken)
            : db.Sessions.Where(s => s.UserId == ended.Subject).ExecuteDeleteAsync(cancellationToken);

    /// <summary>
    /// The account was deleted at the identity service: everything the learner owns goes
    /// through ON DELETE CASCADE (sessions, decks, cards, answers, publications, test scores,
    /// reports). Decks other learners copied are theirs and stay. Deleting twice is harmless.
    /// </summary>
    public Task DeleteAccountAsync(Guid userId, CancellationToken cancellationToken) =>
        db.Users.Where(u => u.Id == userId).ExecuteDeleteAsync(cancellationToken);

    /// <summary>Erudi's own terms, once: accepting again keeps the first date.</summary>
    public async Task<User?> AcceptTermsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
        {
            return null;
        }

        user.TermsAcceptedAt ??= clock.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        return user;
    }
}
