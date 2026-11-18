using Erudi.Api.Study;

namespace Erudi.Api.Tests.Study;

public sealed class StudyStreaksTests
{
    private static readonly DateOnly Today = new(2026, 11, 18);

    [Fact]
    public void Of_NoStudyDay_IsNoStreak() =>
        Assert.Equal((0, 0), StudyStreaks.Of([], Today));

    [Fact]
    public void Of_CountsTheDaysInARowUpToToday() =>
        Assert.Equal((3, 3), StudyStreaks.Of(Days(0, -1, -2), Today));

    [Fact]
    public void Of_KeepsYesterdaysStreakWhileTodayIsNotDoneYet() =>
        Assert.Equal((2, 2), StudyStreaks.Of(Days(-1, -2), Today));

    [Fact]
    public void Of_EndsTheStreakAfterAMissedDay() =>
        Assert.Equal((0, 2), StudyStreaks.Of(Days(-2, -3), Today));

    [Fact]
    public void Of_RemembersTheBestStreak_WhateverTheOrder() =>
        Assert.Equal((1, 4), StudyStreaks.Of(Days(0, -10, -12, -9, -11, -20), Today));

    private static DateOnly[] Days(params int[] offsets) => [.. offsets.Select(Today.AddDays)];
}
