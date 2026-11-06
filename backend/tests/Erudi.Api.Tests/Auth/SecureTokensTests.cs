using Erudi.Api.Auth;

namespace Erudi.Api.Tests.Auth;

public sealed class SecureTokensTests
{
    [Fact]
    public void Create_ReturnsDistinctTokensThatMatchTheExpectedFormat()
    {
        var tokens = Enumerable.Range(0, 100).Select(_ => SecureTokens.Create()).ToList();

        Assert.All(tokens, token => Assert.True(SecureTokens.HasValidFormat(token)));
        Assert.Equal(tokens.Count, tokens.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void Hash_IsADeterministicLowercaseSha256()
    {
        // SHA-256 of "abc", a published test vector.
        Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", SecureTokens.Hash("abc"));
        Assert.Equal(SecureTokens.HashLength, SecureTokens.Hash(SecureTokens.Create()).Length);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+")]
    public void HasValidFormat_RejectsAnythingElse(string? token) => Assert.False(SecureTokens.HasValidFormat(token));
}
