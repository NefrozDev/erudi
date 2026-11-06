using System.Security.Cryptography;
using Erudi.Api.Users;
using Microsoft.AspNetCore.Identity;

namespace Erudi.Api.Auth;

/// <summary>
/// Hashes with ASP.NET Core Identity's hasher (salted PBKDF2-HMAC-SHA512, versioned format),
/// which also reports when a stored hash uses outdated settings and should be upgraded.
/// </summary>
public sealed class PasswordService(IPasswordHasher<User> hasher)
{
    // Checked when the e-mail is unknown, so that case takes as long as a wrong password
    // and response times do not reveal which addresses have an account.
    private readonly Lazy<string> unknownUserHash = new(() => hasher.HashPassword(new User(), RandomNumberGenerator.GetHexString(32)));

    public string Hash(User user, string password) => hasher.HashPassword(user, password);

    public PasswordVerificationResult Verify(User? user, string password)
    {
        if (user is null)
        {
            hasher.VerifyHashedPassword(new User(), unknownUserHash.Value, password);
            return PasswordVerificationResult.Failed;
        }

        return hasher.VerifyHashedPassword(user, user.PasswordHash, password);
    }
}
