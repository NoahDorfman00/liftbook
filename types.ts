export interface Set {
    weight: string;
    reps: string;
}

export interface Movement {
    name: string;
    sets: Set[];
}

export interface Lift {
    id: string;
    date: string;
    title: string;
    movements: Movement[];
}

export interface LiftPreview {
    id: string;
    date: string;
    title: string;
}

export type RootStackParamList = {
    LiftList: undefined;
    LiftEditor: { liftId?: string; date?: string };
    Charts: undefined;
}; 