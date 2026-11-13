import { Error, Loading } from '@/components/shared';
import { TeamTab } from '@/components/team';
import useTeam from 'hooks/useTeam';
import { useTranslation } from 'next-i18next';
import APIKeys from './APIKeys';
import { TeamFeature } from 'types/index';

const APIKeysContainer = ({ teamFeatures }: { teamFeatures: TeamFeature }) => {
  const { t } = useTranslation('common');

  const { isLoading, isError, team } = useTeam();

  if (isLoading) {
    return <Loading />;
  }

  if (isError) {
    return <Error message={isError.message} />;
  }

  if (!team) {
    return <Error message={t('team-not-found')} />;
  }

  return (
    <div className="max-2xl:overflow-x-clip">
      <TeamTab activeTab="api-keys" team={team} teamFeatures={teamFeatures} />
      <APIKeys team={team} />
    </div>
  );
};

export default APIKeysContainer;
