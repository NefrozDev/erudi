using Erudi.Api.Auth.Contracts;
using Erudi.Api.Data;
using Erudi.Api.Users;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Erudi.Api.Auth;

public sealed record IssuedSession(string Token, DateTimeOffset ExpiresAt, User User);

public enum AccountField
{
    Username,
    Email,
}

public abstract record RegistrationResult
{
    private RegistrationResult()
    {
    }

    public sealed record Registered(IssuedSession Session) : RegistrationResult;

    public sealed record Taken(AccountField Field) : RegistrationResult;
}

/// <summary>Accounts and the sessions behind the HttpOnly cookie.</summary>
public sealed class AuthService(
    ErudiDbContext db,
    PasswordService passwords,
    TimeProvider clock,
    IOptions<AuthOptions> options)
{
    public async Task<RegistrationResult> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken)
    {
        var username = request.Username.Trim();
        var email = request.Email.Trim();
        var normalizedUsername = UserRules.Normalize(username);
        var normalizedEmail = UserRules.Normalize(email);

        if (await FindTakenFieldAsync(normalizedUsername, normalizedEmail, cancellationToken) is { } taken)
        {
            return new RegistrationResult.Taken(taken);
        }

        var now = clock.GetUtcNow();
        var user = new User
        {
            Id = Guid.CreateVersion7(now),
            Username = username,
            NormalizedUsername = normalizedUsername,
            Email = email,
            NormalizedEmail = normalizedEmail,
            TermsAcceptedAt = now,
            CreatedAt = now,
        };
        user.PasswordHash = passwords.Hash(user, request.Password);
        db.Users.Add(user);
        var session = AddSession(user, now);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation())
        {
            // A concurrent sign-up took the name or the address between the check and the insert.
            db.ChangeTracker.Clear();
            var takenMeanwhile = await FindTakenFieldAsync(normalizedUsername, normalizedEmail, cancellationToken);
            return new RegistrationResult.Taken(takenMeanwhile ?? AccountField.Username);
        }

        return new RegistrationResult.Registered(session);
    }

    /// <returns>The new session, or <c>null</c> when the e-mail or the password is wrong.</returns>
    public async Task<IssuedSession?> LoginAsync(LoginRequest request, CancellationToken cancellationToken)
    {
        var normalizedEmail = UserRules.Normalize(request.Email);
        var user = await db.Users.SingleOrDefaultAsync(u => u.NormalizedEmail == normalizedEmail, cancellationToken);
        var verification = passwords.Verify(user, request.Password);

        if (user is null || verification == PasswordVerificationResult.Failed)
        {
            return null;
        }

        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = passwords.Hash(user, request.Password);
        }

        var now = clock.GetUtcNow();
        await db.Sessions.Where(s => s.ExpiresAt <= now).ExecuteDeleteAsync(cancellationToken);
        var session = AddSession(user, now);
        await db.SaveChangesAsync(cancellationToken);

        return session;
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
    /// Deletes the account and everything it owns: sessions, decks and their cards, answers,
    /// publications, test scores and reports all go with it through ON DELETE CASCADE.
    /// Decks other learners copied are theirs and stay.
    /// </summary>
    /// <returns><c>false</c> when the password is wrong, and nothing was deleted.</returns>
    public async Task<bool> DeleteAccountAsync(Guid userId, string password, CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
        {
            // Deleted meanwhile, from another tab: the outcome the learner asked for.
            return true;
        }

        if (passwords.Verify(user, password) == PasswordVerificationResult.Failed)
        {
            return false;
        }

        await db.Users.Where(u => u.Id == userId).ExecuteDeleteAsync(cancellationToken);
        return true;
    }

    private IssuedSession AddSession(User user, DateTimeOffset now)
    {
        var token = SecureTokens.Create();
        var expiresAt = now.AddDays(options.Value.SessionTtlDays);
        db.Sessions.Add(new Session
        {
            Id = Guid.CreateVersion7(now),
            TokenHash = SecureTokens.Hash(token),
            UserId = user.Id,
            ExpiresAt = expiresAt,
            CreatedAt = now,
        });

        return new IssuedSession(token, expiresAt, user);
    }

    private async Task<AccountField?> FindTakenFieldAsync(
        string normalizedUsername,
        string normalizedEmail,
        CancellationToken cancellationToken)
    {
        var existing = await db.Users
            .Where(u => u.NormalizedUsername == normalizedUsername || u.NormalizedEmail == normalizedEmail)
            .Select(u => new { u.NormalizedEmail })
            .ToListAsync(cancellationToken);

        if (existing.Count == 0)
        {
            return null;
        }

        return existing.Any(u => u.NormalizedEmail == normalizedEmail) ? AccountField.Email : AccountField.Username;
    }
}
