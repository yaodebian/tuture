import { useMemo } from 'react';

import { useSelector, useDispatch, useStore } from 'react-redux';
import { Layout, Menu, Icon, Modal } from 'antd';
// import { useMediaQuery } from 'react-responsive';
import { Slate } from 'slate-react';
import logo from '../assets/images/logo.svg';

/** @jsx jsx */
import { css, jsx } from '@emotion/core';

import { updateLastSelection } from 'editure';
import LayoutHeader from './LayoutHeader';
import DrawerComponent from './DrawerComponent';
import {
  COLLECTION_CATALOGUE,
  COLLECTION_SETTING,
  CONTACT_US,
  NORMAL,
  COMMIT,
} from '../utils/constants';
import { initializeEditor } from '../utils/editor';
import { buttonRefs, ButtonRefsContext } from '../utils/hotkeys';
import PageCatalogue from './PageCatalogue';

const { Header, Sider, Content } = Layout;

function ConnectedLayout(props) {
  const { children } = props;
  const { commitStatus } = useSelector((state) => state.versionControl);

  const store = useStore();
  const value = useSelector(store.select.collection.nowArticleContent);

  const dispatch = useDispatch();

  // const isLgBreakPoint = useMediaQuery({ query: '(max-width: 992px)' });

  function onToggleDrawer(toggleDrawerType) {
    dispatch.drawer.setVisible(true);
    dispatch.drawer.setChildrenVisible(false);
    dispatch.drawer.setDrawerType(toggleDrawerType);
  }

  function handleOk() {
    dispatch.versionControl.setCommitStatus(NORMAL);
  }

  function handleCancel() {
    dispatch.versionControl.setCommitStatus(NORMAL);
  }

  function onContentChange(val) {
    dispatch.collection.setArticleContent({ fragment: val });
  }

  const editor = useMemo(initializeEditor, []);
  updateLastSelection(editor.selection);

  return (
    <ButtonRefsContext.Provider value={buttonRefs}>
      <Slate editor={editor} value={value} onChange={onContentChange}>
        <DrawerComponent />
        <Layout>
          <Sider
            width={60}
            style={{
              borderRight: '1px solid #eee',
              backgroundColor: 'white',
              zIndex: '1002',
            }}
          >
            <div
              className="logo"
              css={css`
                width: 32px;
                margin: auto;
                text-align: center;
              `}
            >
              <img
                src={logo}
                alt=""
                css={css`
                  width: 100%;
                `}
              />
            </div>
            <Menu
              css={css`
                background-color: white;
                border: none;
                margin: auto;
              `}
              theme="light"
              mode="inline"
              selectable={false}
            >
              <Menu.Item
                key="1"
                title="文集目录"
                style={{ marginTop: '40px' }}
                onClick={() => onToggleDrawer(COLLECTION_CATALOGUE)}
              >
                <Icon type="switcher" />
              </Menu.Item>
              <Menu.Item
                key="2"
                title="文集设置"
                style={{ marginTop: '40px' }}
                onClick={() => onToggleDrawer(COLLECTION_SETTING)}
              >
                <Icon type="setting" />
              </Menu.Item>
              <Menu.Item
                key="3"
                title="联系我们"
                style={{ marginTop: '40px' }}
                onClick={() => onToggleDrawer(CONTACT_US)}
              >
                <Icon type="contacts" />
              </Menu.Item>
            </Menu>
          </Sider>
          <Layout>
            <Header
              css={css`
                background-color: #fff;
                padding: 0 6%;
                border-bottom: 1px solid rgba(232, 232, 232, 1);
              `}
            >
              <LayoutHeader />
            </Header>
            <Content>
              <Layout>
                <Sider
                  width={280}
                  style={{
                    paddingTop: '5px',
                    paddingLeft: '5px',
                    backgroundColor: '#f7f7fa',
                  }}
                >
                  <PageCatalogue />
                </Sider>
                <Content
                  css={css`
                    background: #fff;
                  `}
                >
                  <div
                    css={css`
                      overflow: hidden;
                      position: relative;
                      height: calc(100vh - 64px);
                      width: 100%;
                    `}
                  >
                    {children}
                  </div>
                </Content>
              </Layout>
            </Content>
          </Layout>
        </Layout>
        <Modal
          title="Basic Modal"
          visible={commitStatus === COMMIT}
          onOk={handleOk}
          onCancel={handleCancel}
        >
          <p>Some contents...</p>
          <p>Some contents...</p>
          <p>Some contents...</p>
        </Modal>
      </Slate>
    </ButtonRefsContext.Provider>
  );
}

export default ConnectedLayout;
