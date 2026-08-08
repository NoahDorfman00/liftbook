import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    TextInput,
    FlatList,
    Dimensions,
    Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Line, Path, Circle, Text as SvgText } from 'react-native-svg';
import { RootStackParamList, Lift } from './types';
import { useLifts } from './useLifts';
import { matchesQuery, compareLiftsByDateDesc } from './utils';
import { useTheme } from './theme';

type ChartScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Charts'>;

type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'All';

interface ChartDataPoint {
    date: string;
    minWeight: number;
    avgWeight: number;
    maxWeight: number;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_PADDING_LEFT = 52;
const CHART_PADDING_RIGHT = 20;
const CHART_PADDING_TOP = 16;
const CHART_PADDING_BOTTOM = 36;

const TIME_RANGES: { label: string; value: TimeRange }[] = [
    { label: '1M', value: '1M' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
    { label: 'All', value: 'All' },
];

function getRangeStartDate(range: TimeRange): Date | null {
    if (range === 'All') return null;
    const now = new Date();
    switch (range) {
        case '1M': now.setMonth(now.getMonth() - 1); break;
        case '3M': now.setMonth(now.getMonth() - 3); break;
        case '6M': now.setMonth(now.getMonth() - 6); break;
        case '1Y': now.setFullYear(now.getFullYear() - 1); break;
    }
    return now;
}

function niceTickValues(min: number, max: number, targetCount: number): number[] {
    if (min === max) {
        const v = min;
        return [Math.max(0, v - 10), v, v + 10];
    }
    const range = max - min;
    const roughStep = range / (targetCount - 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const candidates = [1, 2, 2.5, 5, 10];
    let step = candidates[0] * magnitude;
    for (const c of candidates) {
        if (c * magnitude >= roughStep) {
            step = c * magnitude;
            break;
        }
    }
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = niceMin; v <= niceMax + step * 0.01; v += step) {
        ticks.push(Math.round(v * 100) / 100);
    }
    return ticks;
}

function formatDateLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00Z');
    const month = d.toLocaleString('default', { month: 'short', timeZone: 'UTC' });
    const day = d.getUTCDate();
    return `${month} ${day}`;
}

function findMostRecentMovement(allLifts: { [id: string]: Lift }): string | null {
    const liftsArray = Object.values(allLifts);
    liftsArray.sort(compareLiftsByDateDesc);
    for (const lift of liftsArray) {
        for (let i = lift.movements.length - 1; i >= 0; i--) {
            if (lift.movements[i].name.trim()) {
                return lift.movements[i].name.trim();
            }
        }
    }
    return null;
}

function aggregateChartData(
    allLifts: { [id: string]: Lift },
    movementName: string,
    range: TimeRange
): ChartDataPoint[] {
    const rangeStart = getRangeStartDate(range);
    const dateMap: { [date: string]: number[] } = {};
    const normalizedName = movementName.trim().toLowerCase();

    for (const lift of Object.values(allLifts)) {
        if (rangeStart) {
            const liftDate = new Date(lift.date + 'T12:00:00Z');
            if (liftDate < rangeStart) continue;
        }
        for (const movement of lift.movements) {
            if (movement.name.trim().toLowerCase() !== normalizedName) continue;
            for (const set of movement.sets) {
                const w = parseFloat(set.weight);
                if (Number.isFinite(w) && w > 0) {
                    if (!dateMap[lift.date]) dateMap[lift.date] = [];
                    dateMap[lift.date].push(w);
                }
            }
        }
    }

    const points: ChartDataPoint[] = Object.entries(dateMap)
        .map(([date, weights]) => ({
            date,
            minWeight: Math.min(...weights),
            avgWeight: weights.reduce((a, b) => a + b, 0) / weights.length,
            maxWeight: Math.max(...weights),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

    return points;
}

// Only movements that actually appear in the user's lifts — the chart has
// nothing to plot for anything else, so defaults are not suggested here.
function getAllMovementNames(allLifts: { [id: string]: Lift }): string[] {
    const lastUsed = new Map<string, Lift>(); // lowercase name -> most recent lift containing it
    const displayName = new Map<string, string>(); // lowercase name -> original casing

    for (const lift of Object.values(allLifts)) {
        for (const movement of lift.movements) {
            const trimmed = movement.name.trim();
            if (!trimmed) continue;
            const key = trimmed.toLowerCase();
            displayName.set(key, trimmed);
            const prev = lastUsed.get(key);
            if (!prev || compareLiftsByDateDesc(lift, prev) < 0) {
                lastUsed.set(key, lift);
            }
        }
    }

    // Most recently used first
    return Array.from(lastUsed.entries())
        .sort((a, b) => compareLiftsByDateDesc(a[1], b[1]))
        .map(([key]) => displayName.get(key)!);
}

function buildLinePath(
    points: { x: number; y: number }[]
): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M${points[0].x},${points[0].y}`;

    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        d += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
    }
    return d;
}

const ChartScreen: React.FC = () => {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<ChartScreenNavigationProp>();
    const allLifts = useLifts();
    const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
    const [selectedRange, setSelectedRange] = useState<TimeRange>('All');
    const [showMovementPicker, setShowMovementPicker] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<TextInput>(null);

    // Until the user picks a movement, chart the one they most recently logged
    const defaultMovement = useMemo(() => findMostRecentMovement(allLifts), [allLifts]);
    const activeMovement = selectedMovement ?? defaultMovement;

    const chartData = useMemo(() => {
        if (!activeMovement) return [];
        return aggregateChartData(allLifts, activeMovement, selectedRange);
    }, [allLifts, activeMovement, selectedRange]);

    const allMovementNames = useMemo(
        () => getAllMovementNames(allLifts),
        [allLifts]
    );

    const filteredMovements = useMemo(() => {
        const q = searchQuery.trim();
        if (!q) return allMovementNames;
        return allMovementNames.filter(name => matchesQuery(name, q));
    }, [allMovementNames, searchQuery]);

    const chartWidth = SCREEN_WIDTH - 32;
    const chartHeight = 320;
    const plotWidth = chartWidth - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
    const plotHeight = chartHeight - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

    const { yTicks, xLabels, lines } = useMemo(() => {
        if (chartData.length === 0) {
            return { yTicks: [] as number[], xLabels: [] as { label: string; x: number }[], lines: { min: [] as { x: number; y: number }[], avg: [] as { x: number; y: number }[], max: [] as { x: number; y: number }[] } };
        }

        let allMin = Infinity, allMax = -Infinity;
        for (const p of chartData) {
            if (p.minWeight < allMin) allMin = p.minWeight;
            if (p.maxWeight > allMax) allMax = p.maxWeight;
        }
        const yT = niceTickValues(allMin, allMax, 5);
        const yMin = yT[0];
        const yMax = yT[yT.length - 1];
        const yRange = yMax - yMin || 1;

        const toX = (i: number) =>
            CHART_PADDING_LEFT + (chartData.length === 1 ? plotWidth / 2 : (i / (chartData.length - 1)) * plotWidth);
        const toY = (val: number) =>
            CHART_PADDING_TOP + plotHeight - ((val - yMin) / yRange) * plotHeight;

        const minPts = chartData.map((p, i) => ({ x: toX(i), y: toY(p.minWeight) }));
        const avgPts = chartData.map((p, i) => ({ x: toX(i), y: toY(p.avgWeight) }));
        const maxPts = chartData.map((p, i) => ({ x: toX(i), y: toY(p.maxWeight) }));

        const maxXLabels = 5;
        const step = Math.max(1, Math.ceil(chartData.length / maxXLabels));
        const xL: { label: string; x: number }[] = [];
        for (let i = 0; i < chartData.length; i += step) {
            xL.push({ label: formatDateLabel(chartData[i].date), x: toX(i) });
        }
        const lastIdx = chartData.length - 1;
        if (lastIdx > 0 && lastIdx % step !== 0) {
            const lastX = toX(lastIdx);
            const prevX = xL.length > 0 ? xL[xL.length - 1].x : 0;
            if (lastX - prevX > 40) {
                xL.push({ label: formatDateLabel(chartData[lastIdx].date), x: lastX });
            }
        }

        return { yTicks: yT, xLabels: xL, lines: { min: minPts, avg: avgPts, max: maxPts } };
    }, [chartData, plotWidth, plotHeight]);

    const handleSelectMovement = useCallback((name: string) => {
        setSelectedMovement(name);
        setShowMovementPicker(false);
        setSearchQuery('');
    }, []);

    const openPicker = useCallback(() => {
        setSearchQuery('');
        setShowMovementPicker(true);
    }, []);

    const hasData = chartData.length > 0;

    return (
        <View style={[styles.safeArea, { backgroundColor: theme.surface, paddingTop: insets.top || 59, paddingBottom: insets.bottom || 34 }]}>
            <View style={[styles.container, { backgroundColor: theme.paper }]}>
                <View style={[styles.header, { borderBottomColor: theme.line, backgroundColor: theme.surface }]}>
                    <View style={styles.headerCenter}>
                        <Text style={[styles.headerTitle, { color: theme.textStrong }]}>Charts</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Image
                            source={require('./assets/back.png')}
                            style={[styles.backIcon, { tintColor: theme.icon, transform: [{ scaleX: -1 }] }]}
                        />
                    </TouchableOpacity>
                </View>

                <View style={[styles.chartContainer, { backgroundColor: theme.paper }]}>
                    <TouchableOpacity onPress={openPicker}>
                        <Text style={[styles.chartTitle, { color: theme.textStrong }]} numberOfLines={1}>
                            {activeMovement || 'Select Movement'}
                        </Text>
                    </TouchableOpacity>
                    {hasData ? (
                        <Svg width={chartWidth} height={chartHeight}>
                            {/* Grid lines */}
                            {yTicks.map((tick, i) => {
                                const y = CHART_PADDING_TOP + plotHeight - ((tick - yTicks[0]) / ((yTicks[yTicks.length - 1] - yTicks[0]) || 1)) * plotHeight;
                                return (
                                    <Line
                                        key={`hgrid-${i}`}
                                        x1={CHART_PADDING_LEFT}
                                        y1={y}
                                        x2={CHART_PADDING_LEFT + plotWidth}
                                        y2={y}
                                        stroke={theme.chartGrid}
                                        strokeWidth={0.5}
                                    />
                                );
                            })}
                            {xLabels.map((lbl, i) => (
                                <Line
                                    key={`vgrid-${i}`}
                                    x1={lbl.x}
                                    y1={CHART_PADDING_TOP}
                                    x2={lbl.x}
                                    y2={CHART_PADDING_TOP + plotHeight}
                                    stroke={theme.chartGrid}
                                    strokeWidth={0.5}
                                />
                            ))}

                            {/* Y-axis labels */}
                            {yTicks.map((tick, i) => {
                                const y = CHART_PADDING_TOP + plotHeight - ((tick - yTicks[0]) / ((yTicks[yTicks.length - 1] - yTicks[0]) || 1)) * plotHeight;
                                return (
                                    <SvgText
                                        key={`ylabel-${i}`}
                                        x={CHART_PADDING_LEFT - 8}
                                        y={y + 4}
                                        textAnchor="end"
                                        fontFamily="Schoolbell"
                                        fontSize={13}
                                        fill={theme.textSecondary}
                                    >
                                        {tick}
                                    </SvgText>
                                );
                            })}

                            {/* X-axis labels */}
                            {xLabels.map((lbl, i) => (
                                <SvgText
                                    key={`xlabel-${i}`}
                                    x={lbl.x}
                                    y={CHART_PADDING_TOP + plotHeight + 20}
                                    textAnchor="middle"
                                    fontFamily="Schoolbell"
                                    fontSize={12}
                                    fill={theme.textSecondary}
                                >
                                    {lbl.label}
                                </SvgText>
                            ))}

                            {/* Axes */}
                            <Line
                                x1={CHART_PADDING_LEFT}
                                y1={CHART_PADDING_TOP}
                                x2={CHART_PADDING_LEFT}
                                y2={CHART_PADDING_TOP + plotHeight}
                                stroke={theme.chartAxis}
                                strokeWidth={1}
                            />
                            <Line
                                x1={CHART_PADDING_LEFT}
                                y1={CHART_PADDING_TOP + plotHeight}
                                x2={CHART_PADDING_LEFT + plotWidth}
                                y2={CHART_PADDING_TOP + plotHeight}
                                stroke={theme.chartAxis}
                                strokeWidth={1}
                            />

                            {/* Min line */}
                            <Path
                                d={buildLinePath(lines.min)}
                                stroke={theme.chartMin}
                                strokeWidth={2}
                                fill="none"
                                strokeLinecap="round"
                            />
                            {lines.min.map((pt, i) => (
                                <Circle key={`min-${i}`} cx={pt.x} cy={pt.y} r={3} fill={theme.chartMin} />
                            ))}

                            {/* Avg line */}
                            <Path
                                d={buildLinePath(lines.avg)}
                                stroke={theme.chartAvg}
                                strokeWidth={2}
                                fill="none"
                                strokeLinecap="round"
                            />
                            {lines.avg.map((pt, i) => (
                                <Circle key={`avg-${i}`} cx={pt.x} cy={pt.y} r={3} fill={theme.chartAvg} />
                            ))}

                            {/* Max line */}
                            <Path
                                d={buildLinePath(lines.max)}
                                stroke={theme.chartMax}
                                strokeWidth={2.5}
                                fill="none"
                                strokeLinecap="round"
                            />
                            {lines.max.map((pt, i) => (
                                <Circle key={`max-${i}`} cx={pt.x} cy={pt.y} r={3.5} fill={theme.chartMax} />
                            ))}
                        </Svg>
                    ) : (
                        <View style={styles.noDataContainer}>
                            <Text style={[styles.noDataText, { color: theme.textTertiary }]}>
                                {activeMovement ? 'no data for this range' : 'select a movement'}
                            </Text>
                        </View>
                    )}
                    {hasData && (
                        <View style={styles.legend}>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendSwatch, { backgroundColor: theme.chartMax }]} />
                                <Text style={[styles.legendLabel, { color: theme.textSecondary }]}>max</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendSwatch, { backgroundColor: theme.chartAvg }]} />
                                <Text style={[styles.legendLabel, { color: theme.textSecondary }]}>avg</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendSwatch, { backgroundColor: theme.chartMin }]} />
                                <Text style={[styles.legendLabel, { color: theme.textSecondary }]}>min</Text>
                            </View>
                        </View>
                    )}
                </View>

                <View style={[styles.rangeBar, { borderTopColor: theme.line, backgroundColor: theme.surface }]}>
                    {TIME_RANGES.map(({ label, value }) => (
                        <TouchableOpacity
                            key={value}
                            style={styles.rangeButton}
                            onPress={() => setSelectedRange(value)}
                        >
                            <Text
                                style={[
                                    styles.rangeText,
                                    { color: theme.textTertiary },
                                    selectedRange === value && [styles.rangeTextActive, { color: theme.textStrong }],
                                ]}
                            >
                                {label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Modal
                    visible={showMovementPicker}
                    animationType="slide"
                    presentationStyle="pageSheet"
                    onRequestClose={() => setShowMovementPicker(false)}
                >
                    <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: theme.paper }]}>
                        <View style={styles.modalContainer}>
                            <View style={[styles.modalHeader, { borderBottomColor: theme.line }]}>
                                <Text style={[styles.modalTitle, { color: theme.textStrong }]}>Select Movement</Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        setShowMovementPicker(false);
                                        setSearchQuery('');
                                    }}
                                >
                                    <Text style={[styles.modalClose, { color: theme.textSecondary }]}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <TextInput
                                ref={searchInputRef}
                                style={[styles.searchInput, { borderColor: theme.line, color: theme.textStrong }]}
                                placeholder="Search movements..."
                                placeholderTextColor={theme.placeholder}
                                keyboardAppearance={theme.isDark ? 'dark' : 'light'}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoFocus
                                autoCorrect={false}
                                autoCapitalize="none"
                            />
                            <FlatList
                                data={filteredMovements}
                                keyExtractor={(item) => item}
                                keyboardShouldPersistTaps="handled"
                                automaticallyAdjustKeyboardInsets
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.movementItem}
                                        onPress={() => handleSelectMovement(item)}
                                    >
                                        <Text style={[
                                            styles.movementItemText,
                                            { color: theme.textStrong },
                                            item.toLowerCase() === activeMovement?.toLowerCase() &&
                                                [styles.movementItemActive, { color: theme.textPrimary }],
                                        ]}>
                                            {item}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                                ItemSeparatorComponent={() => (
                                    <View style={[styles.movementSeparator, { backgroundColor: theme.line }]} />
                                )}
                            />
                        </View>
                    </SafeAreaView>
                </Modal>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    headerCenter: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 32,
        fontFamily: 'Schoolbell',
        fontWeight: 'bold',
    },
    backButton: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    backIcon: {
        width: 28,
        height: 28,
        resizeMode: 'contain',
    },
    chartTitle: {
        fontSize: 28,
        fontFamily: 'Schoolbell',
        fontWeight: 'bold',
        textAlign: 'center',
        paddingBottom: 8,
    },
    chartContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    noDataContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    noDataText: {
        fontSize: 20,
        fontFamily: 'Schoolbell',
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 24,
        paddingTop: 4,
        paddingHorizontal: 16,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendSwatch: {
        width: 16,
        height: 3,
        borderRadius: 1.5,
    },
    legendLabel: {
        fontSize: 15,
        fontFamily: 'Schoolbell',
    },
    rangeBar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderTopWidth: 1,
    },
    rangeButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    rangeText: {
        fontSize: 18,
        fontFamily: 'Schoolbell',
    },
    rangeTextActive: {
        fontWeight: 'bold',
        textDecorationLine: 'underline',
    },
    modalSafeArea: {
        flex: 1,
    },
    modalContainer: {
        flex: 1,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    modalTitle: {
        fontSize: 24,
        fontFamily: 'Schoolbell',
        fontWeight: 'bold',
    },
    modalClose: {
        fontSize: 18,
        fontFamily: 'Schoolbell',
    },
    searchInput: {
        marginHorizontal: 20,
        marginVertical: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderRadius: 8,
        fontSize: 18,
        fontFamily: 'Schoolbell',
    },
    movementItem: {
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    movementItemText: {
        fontSize: 20,
        fontFamily: 'Schoolbell',
    },
    movementItemActive: {
        fontWeight: 'bold',
    },
    movementSeparator: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 20,
    },
});

export default ChartScreen;
