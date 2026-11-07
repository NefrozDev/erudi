using System.Text.RegularExpressions;

namespace Erudi.Api.Study;

/// <summary>
/// The learner's current day. Leitner boxes count in days ("every 2 days"), so a card answered
/// in the evening comes back on a later morning rather than exactly 48 hours later: due dates
/// are calendar days in the learner's time zone, which the app sends in <see cref="TimeZoneHeader"/>.
/// </summary>
public sealed partial class StudyCalendar(IHttpContextAccessor httpContextAccessor, TimeProvider clock)
{
    public const string TimeZoneHeader = "X-Time-Zone";

    /// <summary>Used when the header is missing or unknown: Erudi's first learners are in Belgium.</summary>
    public const string DefaultTimeZoneId = "Europe/Brussels";

    private const int TimeZoneIdMaxLength = 64;

    public DateOnly Today()
    {
        var localNow = TimeZoneInfo.ConvertTime(clock.GetUtcNow(), ResolveTimeZone());
        return DateOnly.FromDateTime(localNow.DateTime);
    }

    private TimeZoneInfo ResolveTimeZone()
    {
        string? requested = httpContextAccessor.HttpContext?.Request.Headers[TimeZoneHeader];

        // The id is checked before the lookup, which reads a file named after it on Linux.
        if (requested is { Length: <= TimeZoneIdMaxLength }
            && TimeZoneIdPattern().IsMatch(requested)
            && TimeZoneInfo.TryFindSystemTimeZoneById(requested, out var requestedZone))
        {
            return requestedZone;
        }

        return TimeZoneInfo.TryFindSystemTimeZoneById(DefaultTimeZoneId, out var defaultZone) ? defaultZone : TimeZoneInfo.Utc;
    }

    /// <summary>IANA ids such as "Europe/Brussels", "America/Argentina/Buenos_Aires" or "Etc/GMT+5".</summary>
    [GeneratedRegex(@"^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+){0,2}$")]
    private static partial Regex TimeZoneIdPattern();
}
