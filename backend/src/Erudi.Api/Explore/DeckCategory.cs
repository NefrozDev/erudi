using System.Text.Json.Serialization;

namespace Erudi.Api.Explore;

/// <summary>
/// The Explorer's categories (screen 14). The JSON names are the lowercase member names, so a
/// query string (`?category=languages`) binds to the same values: keep them equal. The
/// database stores the member names (at most <see cref="ExploreRules.EnumNameMaxLength"/>
/// characters): never rename one.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<DeckCategory>))]
public enum DeckCategory
{
    [JsonStringEnumMemberName("languages")]
    Languages,

    [JsonStringEnumMemberName("sciences")]
    Sciences,

    [JsonStringEnumMemberName("mathematics")]
    Mathematics,

    [JsonStringEnumMemberName("history")]
    History,

    [JsonStringEnumMemberName("geography")]
    Geography,

    [JsonStringEnumMemberName("computing")]
    Computing,

    [JsonStringEnumMemberName("law")]
    Law,

    [JsonStringEnumMemberName("health")]
    Health,

    [JsonStringEnumMemberName("economics")]
    Economics,

    [JsonStringEnumMemberName("arts")]
    Arts,

    [JsonStringEnumMemberName("general")]
    General,

    [JsonStringEnumMemberName("driving")]
    Driving,

    [JsonStringEnumMemberName("studies")]
    Studies,

    [JsonStringEnumMemberName("other")]
    Other,
}
