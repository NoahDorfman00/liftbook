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
    // sharedTargets: the sharer's sets from an imported lift, shown as
    // ephemeral "shared:" hints during set entry — never persisted
    LiftEditor: { liftId?: string; date?: string; sharedTargets?: Movement[] };
    Charts: undefined;
    SharedLift: { payload: string };
    // fileUrl: a backup file the app can read — opened from outside
    // (AirDrop, "Open in Liftbook") or chosen in the Files picker
    ImportBackup: { fileUrl: string };
};