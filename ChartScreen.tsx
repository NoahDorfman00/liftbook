import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
    PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Line, Path, Circle, Text as SvgText } from 'react-native-svg';
import { RootStackParamList, Lift } from './types';
import { retrieveLifts } from './utils';
import { DEFAULT_MOVEMENTS } from './suggestions';

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

const splitIntoWords = (text: string): string[] => {
    return text
        .split(/[\s\-/:()]+/)
        .filter(word => word.length > 0)
        .map(word => word.toLowerCase());
};

const matchesQuery = (text: string, query: string): boolean => {
    if (!query) return true;
    const targetWords = splitIntoWords(text);
    const queryWords = splitIntoWords(query);
    if (queryWords.length === 0) return true;
    const used = new Array(targetWords.length).fill(false);
    return queryWords.every(qWord => {
        const idx = targetWords.findIndex(
            (tWord, i) => !used[i] && tWord.startsWith(qWord)
        );
        if (idx === -1) return false;
        used[idx] = true;
        return true;
    });
};

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
    liftsArray.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        const idA = Number.isNaN(Number(a.id)) ? 0 : Number(a.id);
        const idB = Number.isNaN(Number(b.id)) ? 0 : Number(b.id);
        return idB - idA;
    });
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

function getAllMovementNames(allLifts: { [id: string]: Lift }): string[] {
    const seen = new Set<string>();
    const names: string[] = [];

    for (const lift of Object.values(allLifts)) {
        for (const movement of lift.movements) {
            const trimmed = movement.name.trim();
            if (!trimmed) continue;
            const key = trimmed.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            names.push(trimmed);
        }
    }

    for (const defaultMov of DEFAULT_MOVEMENTS) {
        const key = defaultMov.trim().toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            names.push(defaultMov.trim());
        }
    }

    names.sort((a, b) => a.localeCompare(b));
    return names;
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
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<ChartScreenNavigationProp>();
    const [allLifts, setAllLifts] = useState<{ [id: string]: Lift }>({});
    const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
    const [selectedRange, setSelectedRange] = useState<TimeRange>('All');
    const [showMovementPicker, setShowMovementPicker] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoaded, setIsLoaded] = useState(false);
    const searchInputRef = useRef<TextInput>(null);

    useEffect(() => {
        (async () => {
            const lifts = await retrieveLifts();
            setAllLifts(lifts);
            const recent = findMostRecentMovement(lifts);
            if (recent) setSelectedMovement(recent);
            setIsLoaded(true);
        })();
    }, []);

    const chartData = useMemo(() => {
        if (!selectedMovement) return [];
        return aggregateChartData(allLifts, selectedMovement, selectedRange);
    }, [allLifts, selectedMovement, selectedRange]);

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

    if (!isLoaded) return <View style={[styles.safeArea, { paddingTop: insets.top || 59, paddingBottom: insets.bottom || 34 }]} />;

    const hasData = chartData.length > 0;

    return (
        <View style={[styles.safeArea, { paddingTop: insets.top || 59, paddingBottom: insets.bottom || 34 }]}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Charts</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Image
                            source={require('./assets/back.png')}
                            style={[styles.backIcon, { transform: [{ scaleX: -1 }] }]}
                        />
                    </TouchableOpacity>
                </View>

                <View style={styles.chartContainer}>
                    <TouchableOpacity onPress={openPicker}>
                        <Text style={styles.chartTitle} numberOfLines={1}>
                            {selectedMovement || 'Select Movement'}
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
                                        stroke="#d4d4d4"
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
                                    stroke="#d4d4d4"
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
                                        fill="#666"
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
                                    fill="#666"
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
                                stroke="#999"
                                strokeWidth={1}
                            />
                            <Line
                                x1={CHART_PADDING_LEFT}
                                y1={CHART_PADDING_TOP + plotHeight}
                                x2={CHART_PADDING_LEFT + plotWidth}
                                y2={CHART_PADDING_TOP + plotHeight}
                                stroke="#999"
                                strokeWidth={1}
                            />

                            {/* Min line */}
                            <Path
                                d={buildLinePath(lines.min)}
                                stroke="#bbb"
                                strokeWidth={2}
                                fill="none"
                                strokeLinecap="round"
                            />
                            {lines.min.map((pt, i) => (
                                <Circle key={`min-${i}`} cx={pt.x} cy={pt.y} r={3} fill="#bbb" />
                            ))}

                            {/* Avg line */}
                            <Path
                                d={buildLinePath(lines.avg)}
                                stroke="#777"
                                strokeWidth={2}
                                fill="none"
                                strokeLinecap="round"
                            />
                            {lines.avg.map((pt, i) => (
                                <Circle key={`avg-${i}`} cx={pt.x} cy={pt.y} r={3} fill="#777" />
                            ))}

                            {/* Max line */}
                            <Path
                                d={buildLinePath(lines.max)}
                                stroke="#333"
                                strokeWidth={2.5}
                                fill="none"
                                strokeLinecap="round"
                            />
                            {lines.max.map((pt, i) => (
                                <Circle key={`max-${i}`} cx={pt.x} cy={pt.y} r={3.5} fill="#333" />
                            ))}
                        </Svg>
                    ) : (
                        <View style={styles.noDataContainer}>
                            <Text style={styles.noDataText}>
                                {selectedMovement ? 'no data for this range' : 'select a movement'}
                            </Text>
                        </View>
                    )}
                    {hasData && (
                        <View style={styles.legend}>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendSwatch, { backgroundColor: '#333' }]} />
                                <Text style={styles.legendLabel}>max</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendSwatch, { backgroundColor: '#777' }]} />
                                <Text style={styles.legendLabel}>avg</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendSwatch, { backgroundColor: '#bbb' }]} />
                                <Text style={styles.legendLabel}>min</Text>
                            </View>
                        </View>
                    )}
                </View>

                <View style={styles.rangeBar}>
                    {TIME_RANGES.map(({ label, value }) => (
                        <TouchableOpacity
                            key={value}
                            style={styles.rangeButton}
                            onPress={() => setSelectedRange(value)}
                        >
                            <Text
                                style={[
                                    styles.rangeText,
                                    selectedRange === value && styles.rangeTextActive,
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
                    <SafeAreaView style={styles.modalSafeArea}>
                        <View style={styles.modalContainer}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Select Movement</Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        setShowMovementPicker(false);
                                        setSearchQuery('');
                                    }}
                                >
                                    <Text style={styles.modalClose}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <TextInput
                                ref={searchInputRef}
                                style={styles.searchInput}
                                placeholder="Search movements..."
                                placeholderTextColor="#9e9e9e"
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
                                            item.toLowerCase() === selectedMovement?.toLowerCase() && styles.movementItemActive,
                                        ]}>
                                            {item}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                                ItemSeparatorComponent={() => <View style={styles.movementSeparator} />}
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
        backgroundColor: '#f5f5f5',
    },
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        backgroundColor: '#f5f5f5',
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
        color: '#333',
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
        color: '#333',
        textAlign: 'center',
        paddingBottom: 8,
    },
    chartContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        backgroundColor: '#fff',
    },
    noDataContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    noDataText: {
        fontSize: 20,
        fontFamily: 'Schoolbell',
        color: '#999',
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
        color: '#666',
    },
    rangeBar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        backgroundColor: '#f5f5f5',
    },
    rangeButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    rangeText: {
        fontSize: 18,
        fontFamily: 'Schoolbell',
        color: '#999',
    },
    rangeTextActive: {
        color: '#333',
        fontWeight: 'bold',
        textDecorationLine: 'underline',
    },
    modalSafeArea: {
        flex: 1,
        backgroundColor: '#fff',
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
        borderBottomColor: '#e0e0e0',
    },
    modalTitle: {
        fontSize: 24,
        fontFamily: 'Schoolbell',
        fontWeight: 'bold',
        color: '#333',
    },
    modalClose: {
        fontSize: 18,
        fontFamily: 'Schoolbell',
        color: '#666',
    },
    searchInput: {
        marginHorizontal: 20,
        marginVertical: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 8,
        fontSize: 18,
        fontFamily: 'Schoolbell',
        color: '#333',
    },
    movementItem: {
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    movementItemText: {
        fontSize: 20,
        fontFamily: 'Schoolbell',
        color: '#333',
    },
    movementItemActive: {
        fontWeight: 'bold',
        color: '#000',
    },
    movementSeparator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#e0e0e0',
        marginHorizontal: 20,
    },
});

export default ChartScreen;
