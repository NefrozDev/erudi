using Erudi.Api.Study;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Time.Testing;

namespace Erudi.Api.Tests.Study;

public sealed class StudyCalendarTests
{
    // 23:30 UTC on 6 November is already 7 November in Brussels (UTC+1 in winter).
    private static readonly DateTimeOffset LateEvening = new(2026, 11, 6, 23, 30, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Noon = new(2026, 11, 6, 12, 0, 0, TimeSpan.Zero);

    public static TheoryData<DateTimeOffset, string?, DateOnly> Days => new()
    {
        { LateEvening, "Europe/Brussels", new DateOnly(2026, 11, 7) },
        { LateEvening, "America/New_York", new DateOnly(2026, 11, 6) },
        { LateEvening, "Etc/UTC", new DateOnly(2026, 11, 6) },
        { Noon, "Pacific/Kiritimati", new DateOnly(2026, 11, 7) },
        { Noon, "Pacific/Pago_Pago", new DateOnly(2026, 11, 6) },
    };

    [Theory]
    [MemberData(nameof(Days))]
    public void Today_IsTheDayInTheLearnersTimeZone(DateTimeOffset now, string? timeZone, DateOnly expected) =>
        Assert.Equal(expected, CalendarAt(now, timeZone).Today());

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Mars/Olympus_Mons")]
    [InlineData("../../etc/passwd")]
    [InlineData("/etc/localtime")]
    [InlineData("Europe/Brussels\0")]
    [InlineData("Romance Standard Time")]
    [InlineData("Europe/Brussels, America/New_York")]
    public void Today_FallsBackToBrusselsForAMissingOrUnusableTimeZone(string? timeZone) =>
        Assert.Equal(new DateOnly(2026, 11, 7), CalendarAt(LateEvening, timeZone).Today());

    [Fact]
    public void Today_FallsBackToBrusselsOutsideARequest()
    {
        var calendar = new StudyCalendar(new HttpContextAccessor(), new FakeTimeProvider(LateEvening));

        Assert.Equal(new DateOnly(2026, 11, 7), calendar.Today());
    }

    [Fact]
    public void Today_RejectsAnOverlongTimeZoneWithoutLookingItUp()
    {
        var overlong = "Europe/" + new string('B', 80);

        Assert.Equal(new DateOnly(2026, 11, 7), CalendarAt(LateEvening, overlong).Today());
    }

    private static StudyCalendar CalendarAt(DateTimeOffset now, string? timeZone)
    {
        var context = new DefaultHttpContext();
        if (timeZone is not null)
        {
            context.Request.Headers[StudyCalendar.TimeZoneHeader] = timeZone;
        }

        return new StudyCalendar(new HttpContextAccessor { HttpContext = context }, new FakeTimeProvider(now));
    }
}
