namespace Erudi.Api.Study;

/// <summary>
/// The five Leitner boxes (screen 13). A known card moves up a box and comes back less often;
/// a forgotten one goes back to the first box and comes back the next day.
/// </summary>
public static class LeitnerSchedule
{
    public const int FirstBox = 1;
    public const int LastBox = 5;

    // Every day, every 2 days, every 4 days, every week, every 2 weeks.
    private static readonly int[] IntervalDays = [1, 2, 4, 7, 14];

    public static int IntervalDaysOf(int box) => IntervalDays[box - FirstBox];

    public static (int Box, DateOnly DueOn) After(int box, bool knew, DateOnly today)
    {
        var next = knew ? Math.Min(box + 1, LastBox) : FirstBox;
        return (next, today.AddDays(IntervalDaysOf(next)));
    }
}
