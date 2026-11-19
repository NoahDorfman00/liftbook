import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import LiftPreviewList from '../LiftPreviewList';
import { LiftPreview } from '../types';

const render = async (lifts: LiftPreview[], backup: boolean) => {
    const noop = () => {};
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <LiftPreviewList
                lifts={lifts}
                onSelectLift={noop}
                onShareLift={noop}
                onDeleteLift={noop}
                onCreateNewLift={noop}
                onOpenCharts={noop}
                onBackUp={backup ? noop : undefined}
                onImportBackup={backup ? noop : undefined}
            />
        );
    });
    // every Text's content, flattened
    return tree.root
        .findAllByType(Text)
        .map(node => [node.props.children].flat(Infinity).join(''))
        .join('\n');
};

const lifts: LiftPreview[] = [
    { id: '1', date: '2026-11-18', title: 'Pull' },
    { id: '2', date: '2026-11-17', title: 'Push' },
];

describe('backup entry points', () => {
    it('shows the footer under a list with lifts', async () => {
        const text = await render(lifts, true);
        expect(text).toContain('2 lifts · ');
        expect(text).toContain('Back up');
        expect(text).not.toContain('or import a backup');
    });

    it('hides the footer with no lifts, and offers import instead', async () => {
        const text = await render([], true);
        expect(text).not.toContain('Back up');
        expect(text).toContain('or import a backup');
    });

    it('shows neither where backups are not supported', async () => {
        expect(await render(lifts, false)).not.toContain('Back up');
        expect(await render([], false)).not.toContain('or import a backup');
    });
});
