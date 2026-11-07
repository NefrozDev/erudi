using Erudi.Api.Study;

namespace Erudi.Api.Tests.Study;

public sealed class LeitnerScheduleTests
{
    private static readonly DateOnly Today = new(2026, 11, 7);

    [Theory]
    [InlineData(1, 2, 2)]
    [InlineData(2, 3, 4)]
    [InlineData(3, 4, 7)]
    [InlineData(4, 5, 14)]
    [InlineData(5, 5, 14)]
    public void After_AKnownCardMovesUpABox_AndComesBackAfterThatBoxsInterval(int box, int expectedBox, int expectedDays) =>
        Assert.Equal((expectedBox, Today.AddDays(expectedDays)), LeitnerSchedule.After(box, knew: true, Today));

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(5)]
    public void After_AForgottenCardGoesBackToBoxOne_AndComesBackTomorrow(int box) =>
        Assert.Equal((1, Today.AddDays(1)), LeitnerSchedule.After(box, knew: false, Today));

    [Theory]
    [InlineData(1, 1)]
    [InlineData(2, 2)]
    [InlineData(3, 4)]
    [InlineData(4, 7)]
    [InlineData(5, 14)]
    public void IntervalDaysOf_MatchesScreen13(int box, int days) =>
        Assert.Equal(days, LeitnerSchedule.IntervalDaysOf(box));
}
