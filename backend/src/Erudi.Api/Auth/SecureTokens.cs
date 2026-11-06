using System.Buffers.Text;
using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Erudi.Api.Auth;

/// <summary>
/// Opaque tokens for session cookies and reset links. Only their SHA-256 is stored, so a
/// leaked database cannot be used to sign in or to reset a password.
/// </summary>
public static partial class SecureTokens
{
    /// <summary>32 random bytes in unpadded base64url.</summary>
    public const string Pattern = "^[A-Za-z0-9_-]{43}$";

    /// <summary>A SHA-256 in hexadecimal.</summary>
    public const int HashLength = 64;

    private const int ByteLength = 32;

    public static string Create() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(ByteLength));

    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    /// <summary>Rejects junk before it costs a database lookup.</summary>
    public static bool HasValidFormat([NotNullWhen(true)] string? token) => token is not null && FormatRegex().IsMatch(token);

    [GeneratedRegex(Pattern)]
    private static partial Regex FormatRegex();
}
