using System.Text.Json.Serialization;

namespace Erudi.Api.Explore;

/// <summary>
/// The Explorer's categories (screen 14). The JSON names are the lowercase member names, so a
/// query string (`?category=languages`) binds to the same values.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<DeckCategory>))]
public enum DeckCategory
{
    [JsonStringEnumMemberName("languages")]
    Languages,

    [JsonStringEnumMemberName("driving")]
    Driving,

    [JsonStringEnumMemberName("studies")]
    Studies,

    [JsonStringEnumMemberName("other")]
    Other,
}
