import React, { useState, useContext, useCallback } from "react";
import { Params } from "react-router/lib/Router";
import { useQuery } from "react-query";
import { useErrorHandler } from "react-error-boundary";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";

import classnames from "classnames";
import { pick } from "lodash";

import { AppContext, IAppContext } from "context/app";
import { NotificationContext } from "context/notification";
import deviceUserAPI from "services/entities/device_user";
import { IHost, IDeviceMappingResponse } from "interfaces/host";
import { ISoftware } from "interfaces/software";
import { IHostPolicy } from "interfaces/policy";
import PageError from "components/DataError";
// @ts-ignore
import OrgLogoIcon from "components/icons/OrgLogoIcon";
import Spinner from "components/Spinner";
import Button from "components/buttons/Button";
import TabsWrapper from "components/TabsWrapper";
import { normalizeEmptyValues, wrapFleetHelper } from "utilities/helpers";

import HostSummaryCard from "../cards/HostSummary";
import AboutCard from "../cards/About";
import SoftwareCard from "../cards/Software";
import PoliciesCard from "../cards/Policies";
import InfoModal from "./InfoModal";

import InfoIcon from "../../../../../assets/images/icon-info-purple-14x14@2x.png";
import FleetIcon from "../../../../../assets/images/fleet-avatar-24x24@2x.png";
import PolicyDetailsModal from "../cards/Policies/HostPoliciesTable/PolicyDetailsModal";

const baseClass = "device-user";

interface IDeviceUserPageProps {
  params: Params;
}

interface IHostResponse {
  host: IHost;
  org_logo_url: string;
}

const DeviceUserPage = ({
  params: { device_auth_token },
}: IDeviceUserPageProps): JSX.Element => {
  const deviceAuthToken = device_auth_token;
  const { renderFlash } = useContext(NotificationContext);
  const { isPremiumTier } = useContext(AppContext);
  const handlePageError = useErrorHandler();

  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);

  const [refetchStartTime, setRefetchStartTime] = useState<number | null>(null);
  const [showRefetchSpinner, setShowRefetchSpinner] = useState<boolean>(false);
  const [hostSoftware, setHostSoftware] = useState<ISoftware[]>([]);
  const [host, setHost] = useState<IHost | null>();
  const [orgLogoURL, setOrgLogoURL] = useState<string>("");
  const [selectedPolicy, setSelectedPolicy] = useState<IHostPolicy | null>(
    null
  );
  const [showPolicyDetailsModal, setShowPolicyDetailsModal] = useState<boolean>(
    false
  );

  const { data: deviceMapping, refetch: refetchDeviceMapping } = useQuery(
    ["deviceMapping", deviceAuthToken],
    () =>
      deviceUserAPI.loadHostDetailsExtension(deviceAuthToken, "device_mapping"),
    {
      enabled: !!deviceAuthToken,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: false,
      select: (data: IDeviceMappingResponse) => data.device_mapping,
    }
  );

  const refetchExtensions = () => {
    deviceMapping !== null && refetchDeviceMapping();
  };

  const {
    isLoading: isLoadingHost,
    error: loadingDeviceUserError,
    refetch: refetchHostDetails,
  } = useQuery<IHostResponse, Error, IHostResponse>(
    ["host", deviceAuthToken],
    () => deviceUserAPI.loadHostDetails(deviceAuthToken),
    {
      enabled: !!deviceAuthToken,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: false,
      select: (data: IHostResponse) => data,
      onSuccess: (returnedHost) => {
        setShowRefetchSpinner(returnedHost.host.refetch_requested);
        if (returnedHost.host.refetch_requested) {
          if (!refetchStartTime) {
            if (returnedHost.host.status === "online") {
              setRefetchStartTime(Date.now());
              setTimeout(() => {
                refetchHostDetails();
                refetchExtensions();
              }, 1000);
            } else {
              setShowRefetchSpinner(false);
            }
          } else {
            const totalElapsedTime = Date.now() - refetchStartTime;
            if (totalElapsedTime < 60000) {
              if (returnedHost.host.status === "online") {
                setTimeout(() => {
                  refetchHostDetails();
                  refetchExtensions();
                }, 1000);
              } else {
                renderFlash(
                  "error",
                  `This host is offline. Please try refetching host vitals later.`
                );
                setShowRefetchSpinner(false);
              }
            } else {
              renderFlash(
                "error",
                `We're having trouble fetching fresh vitals for this host. Please try again later.`
              );
              setShowRefetchSpinner(false);
            }
          }
          return;
        }
        setHostSoftware(returnedHost.host.software);
        setHost(returnedHost.host);
        setOrgLogoURL(returnedHost.org_logo_url);
      },
      onError: (error) => handlePageError(error),
    }
  );

  const titleData = normalizeEmptyValues(
    pick(host, [
      "status",
      "issues",
      "memory",
      "cpu_type",
      "os_version",
      "osquery_version",
      "enroll_secret_name",
      "detail_updated_at",
      "percent_disk_space_available",
      "gigs_disk_space_available",
    ])
  );

  const aboutData = normalizeEmptyValues(
    pick(host, [
      "seen_time",
      "uptime",
      "last_enrolled_at",
      "hardware_model",
      "hardware_serial",
      "primary_ip",
      "public_ip",
    ])
  );

  const toggleInfoModal = useCallback(() => {
    setShowInfoModal(!showInfoModal);
  }, [showInfoModal, setShowInfoModal]);

  const togglePolicyDetailsModal = useCallback(
    (policy: IHostPolicy) => {
      setShowPolicyDetailsModal(!showPolicyDetailsModal);
      setSelectedPolicy(policy);
    },
    [showPolicyDetailsModal, setShowPolicyDetailsModal, setSelectedPolicy]
  );
  const onCancelPolicyDetailsModal = useCallback(() => {
    setShowPolicyDetailsModal(!showPolicyDetailsModal);
    setSelectedPolicy(null);
  }, [showPolicyDetailsModal, setShowPolicyDetailsModal, setSelectedPolicy]);

  const onRefetchHost = async () => {
    if (host) {
      setShowRefetchSpinner(true);
      try {
        await deviceUserAPI.refetch(deviceAuthToken).then(() => {
          setRefetchStartTime(Date.now());
          setTimeout(() => {
            refetchHostDetails();
            refetchExtensions();
          }, 1000);
        });
      } catch (error) {
        console.log(error);
        renderFlash("error", `Host "${host.hostname}" refetch error`);
        setShowRefetchSpinner(false);
      }
    }
  };

  const renderActionButtons = () => {
    return (
      <div className={`${baseClass}__action-button-container`}>
        <Button onClick={() => setShowInfoModal(true)} variant="text-icon">
          <>
            Info <img src={InfoIcon} alt="Host info icon" />
          </>
        </Button>
      </div>
    );
  };

  const statusClassName = classnames("status", `status--${host?.status}`);

  const renderDeviceUserPage = () => {
    return (
      <div className="fleet-desktop-wrapper">
        {isLoadingHost ? (
          <Spinner />
        ) : (
          <div className={`${baseClass} body-wrap`}>
            <HostSummaryCard
              statusClassName={statusClassName}
              titleData={titleData}
              showRefetchSpinner={showRefetchSpinner}
              onRefetchHost={onRefetchHost}
              renderActionButtons={renderActionButtons}
              isPremiumTier
              deviceUser
            />
            <TabsWrapper>
              <Tabs>
                <TabList>
                  <Tab>Details</Tab>
                  <Tab>Software</Tab>
                  {isPremiumTier && (
                    <Tab>
                      <div>
                        {titleData.issues.failing_policies_count > 0 && (
                          <span className="fail-count">
                            {titleData.issues.failing_policies_count}
                          </span>
                        )}
                        Policies
                      </div>
                    </Tab>
                  )}
                </TabList>
                <TabPanel>
                  <AboutCard
                    aboutData={aboutData}
                    deviceMapping={deviceMapping}
                    wrapFleetHelper={wrapFleetHelper}
                    deviceUser
                  />
                </TabPanel>
                <TabPanel>
                  <SoftwareCard
                    isLoading={isLoadingHost}
                    software={hostSoftware}
                    deviceUser
                  />
                </TabPanel>
                {isPremiumTier && (
                  <TabPanel>
                    <PoliciesCard
                      policies={host?.policies || []}
                      isLoading={isLoadingHost}
                      deviceUser
                      togglePolicyDetailsModal={togglePolicyDetailsModal}
                    />
                  </TabPanel>
                )}
              </Tabs>
            </TabsWrapper>
            {showInfoModal && <InfoModal onCancel={toggleInfoModal} />}
          </div>
        )}
        {!!host && showPolicyDetailsModal && (
          <PolicyDetailsModal
            onCancel={onCancelPolicyDetailsModal}
            policy={selectedPolicy}
          />
        )}
      </div>
    );
  };

  return (
    <div className="app-wrap">
      <nav className="site-nav">
        <div className="site-nav-container">
          <ul className="site-nav-list">
            <li className={`site-nav-item--logo`} key={`nav-item`}>
              <OrgLogoIcon className="logo" src={orgLogoURL || FleetIcon} />
            </li>
          </ul>
        </div>
      </nav>
      {loadingDeviceUserError ? <PageError /> : renderDeviceUserPage()}
    </div>
  );
};

export default DeviceUserPage;
