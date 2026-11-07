using System.Text.Json.Serialization;

namespace Erudi.Api.Explore;

/// <summary>Why a learner reports a public deck (see <see cref="DeckCategory"/> for the JSON names).</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ReportReason>))]
public enum ReportReason
{
    [JsonStringEnumMemberName("offensive")]
    Offensive,

    [JsonStringEnumMemberName("incorrect")]
    Incorrect,

    [JsonStringEnumMemberName("spam")]
    Spam,

    [JsonStringEnumMemberName("copyright")]
    Copyright,

    [JsonStringEnumMemberName("other")]
    Other,
}
