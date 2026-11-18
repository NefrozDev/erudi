namespace Erudi.Api.Study;

/// <summary>Streaks count the learner's days with at least one quiz answer (their study days).</summary>
public static class StudyStreaks
{
    /// <summary>Days in a row with at least one quiz answer, up to today, or yesterday while today is not done yet.</summary>
    public static (int Current, int Best) Of(IReadOnlyCollection<DateOnly> studyDays, DateOnly today)
    {
        var days = studyDays.ToHashSet();
        var best = 0;
        foreach (var day in days.Where(d => !days.Contains(d.AddDays(-1))))
        {
            var length = 1;
            while (days.Contains(day.AddDays(length)))
            {
                length++;
            }

            best = Math.Max(best, length);
        }

        var current = 0;
        for (var day = days.Contains(today) ? today : today.AddDays(-1); days.Contains(day); day = day.AddDays(-1))
        {
            current++;
        }

        return (current, best);
    }
}
